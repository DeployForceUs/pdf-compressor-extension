import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readdir, rm, stat, unlink } from "node:fs/promises";
import { resolve } from "node:path";

import { inspectPdf, processBalancedPdf } from "./ghostscript-processor.mjs";
import { evaluateOutputArtifact } from "./output-artifact-policy.mjs";
import {
  BALANCED_PROCESSING_POLICY,
  DEFAULT_ENGINE_WORK_ROOT,
  ENGINE_LIMITS,
} from "./processing-config.mjs";

export class EngineRequestError extends Error {
  constructor(statusCode, code) {
    super(code);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function publicJob(job) {
  return {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    preset: BALANCED_PROCESSING_POLICY.preset,
    createdAt: job.createdAt,
    ...(job.completedAt ? { completedAt: job.completedAt } : {}),
    ...(job.expiresAt ? { expiresAt: job.expiresAt } : {}),
    ...(job.status === "completed"
      ? {
          result: {
            kind: job.resultKind,
            reason: job.resultReason,
            bytes: job.resultBytes,
            savedBytes: job.savedBytes,
          },
        }
      : {}),
  };
}

export class OfficeEngineJobManager {
  constructor({
    workRoot = process.env.ENGINE_WORK_ROOT || DEFAULT_ENGINE_WORK_ROOT,
    limits = ENGINE_LIMITS,
    inspect = inspectPdf,
    processPdf = processBalancedPdf,
    now = () => Date.now(),
  } = {}) {
    this.workRoot = resolve(workRoot);
    this.limits = limits;
    this.inspect = inspect;
    this.processPdf = processPdf;
    this.now = now;
    this.jobs = new Map();
    this.queue = [];
    this.active = 0;
    this.disposed = false;
  }

  async initialize({ purge = true } = {}) {
    await mkdir(this.workRoot, { recursive: true, mode: 0o700 });
    if (purge) {
      const entries = await readdir(this.workRoot);
      await Promise.all(entries.map((entry) => rm(resolve(this.workRoot, entry), {
        recursive: true,
        force: true,
      })));
    }
  }

  async createJob(stream, { contentType, contentLength }) {
    if (this.disposed) throw new EngineRequestError(503, "engine_stopping");
    if (contentType !== "application/pdf") {
      throw new EngineRequestError(415, "unsupported_media_type");
    }
    if (Number.isFinite(contentLength) && contentLength > this.limits.maxFileSizeBytes) {
      throw new EngineRequestError(413, "file_too_large");
    }

    await mkdir(this.workRoot, { recursive: true, mode: 0o700 });
    const id = randomUUID();
    const directory = resolve(this.workRoot, id);
    const inputPath = resolve(directory, "input.pdf");
    const outputPath = resolve(directory, "output.pdf");
    await mkdir(directory, { mode: 0o700 });

    let handle;
    let bytes = 0;
    try {
      handle = await open(inputPath, "wx", 0o600);
      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.byteLength;
        if (bytes > this.limits.maxFileSizeBytes) {
          throw new EngineRequestError(413, "file_too_large");
        }
        await handle.write(buffer);
      }
      await handle.close();
      handle = undefined;
      if (bytes < 5) throw new EngineRequestError(400, "invalid_pdf");
      const magic = Buffer.alloc(5);
      const input = await open(inputPath, "r");
      try {
        await input.read(magic, 0, magic.byteLength, 0);
      } finally {
        await input.close();
      }
      if (magic.toString("ascii") !== "%PDF-") {
        throw new EngineRequestError(400, "invalid_pdf");
      }
      const { pageCount } = await this.inspect(inputPath);
      const createdAt = new Date(this.now()).toISOString();
      const job = {
        id,
        directory,
        inputPath,
        outputPath,
        inputBytes: bytes,
        inputPageCount: pageCount,
        createdAt,
        status: "queued",
        progress: 0,
      };
      this.jobs.set(id, job);
      this.queue.push(id);
      this.#drain();
      return publicJob(job);
    } catch (error) {
      await handle?.close().catch(() => {});
      await rm(directory, { recursive: true, force: true });
      if (error instanceof EngineRequestError) throw error;
      throw new EngineRequestError(400, "invalid_pdf");
    }
  }

  getJob(id) {
    const job = this.jobs.get(id);
    return job ? publicJob(job) : null;
  }

  getResult(id) {
    const job = this.jobs.get(id);
    if (!job) throw new EngineRequestError(404, "job_not_found");
    if (job.status !== "completed" || !job.resultPath) {
      throw new EngineRequestError(409, "result_not_ready");
    }
    return {
      stream: createReadStream(job.resultPath),
      bytes: job.resultBytes,
      kind: job.resultKind,
    };
  }

  async cancel(id) {
    const job = this.jobs.get(id);
    if (!job) throw new EngineRequestError(404, "job_not_found");
    if (job.status === "queued") {
      this.queue = this.queue.filter((candidate) => candidate !== id);
      job.status = "cancelled";
      job.progress = 0;
      await this.#finish(job, { cleanupNow: true });
    } else if (job.status === "processing") {
      job.cancelRequested = true;
      job.status = "cancelling";
      job.controller.abort();
    }
    return publicJob(job);
  }

  async dispose() {
    this.disposed = true;
    for (const job of this.jobs.values()) {
      clearTimeout(job.retentionTimer);
      job.controller?.abort();
      await rm(job.directory, { recursive: true, force: true });
    }
    this.jobs.clear();
    this.queue = [];
  }

  #drain() {
    while (this.active < this.limits.maxConcurrentJobs && this.queue.length > 0) {
      const id = this.queue.shift();
      const job = this.jobs.get(id);
      if (!job || job.status !== "queued") continue;
      this.active += 1;
      void this.#run(job).finally(() => {
        this.active -= 1;
        this.#drain();
      });
    }
  }

  async #run(job) {
    job.status = "processing";
    job.progress = 50;
    job.controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      job.controller.abort();
    }, this.limits.processingTimeoutSeconds * 1000);
    timeout.unref?.();

    try {
      await this.processPdf({
        inputPath: job.inputPath,
        outputPath: job.outputPath,
        signal: job.controller.signal,
        maxOutputBytes: this.limits.maxFileSizeBytes,
      });
      const [outputInfo, outputStats] = await Promise.all([
        this.inspect(job.outputPath),
        stat(job.outputPath),
      ]);
      const decision = evaluateOutputArtifact({
        inputBytes: job.inputBytes,
        inputPageCount: job.inputPageCount,
        outputBytes: outputStats.size,
        outputPageCount: outputInfo.pageCount,
        outputOpens: true,
      });
      if (decision.action === "accept_output") {
        job.resultPath = job.outputPath;
        job.resultKind = "compressed";
        job.resultReason = decision.reason;
        job.resultBytes = outputStats.size;
        job.savedBytes = decision.savedBytes;
        await unlink(job.inputPath).catch(() => {});
      } else {
        job.resultPath = job.inputPath;
        job.resultKind = "original";
        job.resultReason = decision.reason;
        job.resultBytes = job.inputBytes;
        job.savedBytes = 0;
        await unlink(job.outputPath).catch(() => {});
      }
      job.status = "completed";
      job.progress = 100;
      await this.#finish(job);
    } catch {
      await unlink(job.outputPath).catch(() => {});
      if (job.cancelRequested) {
        job.status = "cancelled";
        job.progress = 0;
        await this.#finish(job, { cleanupNow: true });
      } else {
        job.status = "completed";
        job.progress = 100;
        job.resultPath = job.inputPath;
        job.resultKind = "original";
        job.resultReason = timedOut ? "processing_timeout" : "processing_failed";
        job.resultBytes = job.inputBytes;
        job.savedBytes = 0;
        await this.#finish(job);
      }
    } finally {
      clearTimeout(timeout);
      delete job.controller;
    }
  }

  async #finish(job, { cleanupNow = false } = {}) {
    const completed = this.now();
    job.completedAt = new Date(completed).toISOString();
    job.expiresAt = new Date(completed + this.limits.retentionMinutes * 60_000).toISOString();
    if (cleanupNow) await rm(job.directory, { recursive: true, force: true });
    job.retentionTimer = setTimeout(async () => {
      await rm(job.directory, { recursive: true, force: true });
      this.jobs.delete(job.id);
    }, this.limits.retentionMinutes * 60_000);
    job.retentionTimer.unref?.();
  }
}
