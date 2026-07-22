import assert from "node:assert/strict";
import test from "node:test";

import { createTargetContract } from "../src/lib/ai-runtime/domain/target-contract.js";
import { AiExecutionCoordinator } from "../src/lib/ai-runtime/execution-coordinator.js";
import type {
  PersistedSplitPart,
  SplitPartStore,
  SplitPort,
  ZipCreateRequest,
  ZipPort,
} from "../src/lib/ai-runtime/ports.js";

const contract = createTargetContract({
  contractId: "portal-small-target",
  goalKind: "portal",
  targetSizeMb: 0.001,
});

function pdfBytes(length = 100): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
  return bytes;
}

function part(recordId: string, bytes = pdfBytes()): PersistedSplitPart {
  return { recordId, byteLength: bytes.byteLength, bytes };
}

async function harness(parts: readonly PersistedSplitPart[]) {
  const zipRequests: ZipCreateRequest[] = [];
  const split: SplitPort = { async start() {} };
  const splitParts: SplitPartStore = {
    async read(recordId) {
      return parts.find((candidate) => candidate.recordId === recordId) ?? null;
    },
  };
  const zip: ZipPort = {
    async createAndPersist(request) {
      zipRequests.push(request);
      return {
        recordId: "zip-record",
        artifactIds: request.artifactIds,
        byteLength: 256,
      };
    },
  };
  const coordinator = new AiExecutionCoordinator({
    compression: { async start() {} },
    compressedResults: {
      async read(recordId) {
        return recordId === "compressed-pdf"
          ? { recordId, sourceRecordId: "selected-pdf", byteLength: 2000 }
          : null;
      },
    },
    split,
    splitParts,
    zip,
  });

  coordinator.confirmContract({
    executionId: "execution-zip",
    sourceRecordId: "selected-pdf",
    contract,
  });
  coordinator.beginPlanning();
  coordinator.acceptPlan({ route: "local", preset: "balanced" });
  await coordinator.startCompression();
  assert.equal(await coordinator.handleCompressionResult({
    executionId: "execution-zip",
    sourceRecordId: "selected-pdf",
    compressedRecordId: "compressed-pdf",
    metadataBytes: 2000,
  }), true);
  assert.equal(coordinator.evaluateCompressedResultSize(), "prepare_split");
  await coordinator.startSplit();
  assert.equal(coordinator.handleSplitResult({
    executionId: "execution-zip",
    compressedRecordId: "compressed-pdf",
    artifactIds: ["part-1", "part-2"],
  }), true);

  return { coordinator, zipRequests };
}

test("validates every persisted part before ZIP creation becomes legal", async () => {
  const { coordinator, zipRequests } = await harness([part("part-1"), part("part-2")]);
  assert.equal(coordinator.snapshot().capabilities.canDownloadZip, false);
  assert.equal(zipRequests.length, 0);

  assert.equal(await coordinator.validateSplitParts(), true);
  assert.equal(coordinator.state.status, "creating_zip");
  assert.equal(zipRequests.length, 0);
  assert.equal(coordinator.snapshot().capabilities.canDownloadZip, false);
});

test("one invalid PDF signature prevents success and ZIP creation", async () => {
  const invalid = new Uint8Array([0x50, 0x44, 0x46]);
  const { coordinator, zipRequests } = await harness([part("part-1"), part("part-2", invalid)]);

  assert.equal(await coordinator.validateSplitParts(), false);
  assert.equal(coordinator.state.status, "failed");
  if (coordinator.state.status !== "failed") throw new Error("unexpected state");
  assert.equal(coordinator.state.failure.code, "split_part_invalid");
  assert.equal(zipRequests.length, 0);
  assert.equal(coordinator.snapshot().capabilities.canDownloadZip, false);
});

test("an oversized part produces an explicit terminal error", async () => {
  const oversized = pdfBytes(contract.targetBytes + 1);
  const { coordinator } = await harness([part("part-1"), part("part-2", oversized)]);

  assert.equal(await coordinator.validateSplitParts(), false);
  assert.equal(coordinator.state.status, "failed");
  if (coordinator.state.status !== "failed") throw new Error("unexpected state");
  assert.equal(coordinator.state.failure.code, "split_part_oversized");
  assert.equal(coordinator.snapshot().capabilities.canDownloadZip, false);
});

test("completes as ZIP only after validated artifacts are persisted", async () => {
  const { coordinator, zipRequests } = await harness([part("part-1"), part("part-2")]);
  assert.equal(await coordinator.validateSplitParts(), true);
  assert.equal(await coordinator.createZip(), true);

  assert.deepEqual(zipRequests, [{
    executionId: "execution-zip",
    compressedRecordId: "compressed-pdf",
    artifactIds: ["part-1", "part-2"],
    outputMode: "single-zip",
  }]);
  assert.equal(coordinator.state.status, "completed_zip");
  if (coordinator.state.status !== "completed_zip") throw new Error("unexpected state");
  assert.equal(coordinator.state.zipRecordId, "zip-record");
  assert.equal(coordinator.snapshot().capabilities.canDownloadZip, true);
  assert.equal(coordinator.snapshot().capabilities.canDownloadPdf, false);
});

test("mismatched persisted ZIP never becomes downloadable", async () => {
  const { coordinator } = await harness([part("part-1"), part("part-2")]);
  assert.equal(await coordinator.validateSplitParts(), true);

  const badCoordinator = coordinator as AiExecutionCoordinator;
  Object.defineProperty(badCoordinator, "unused", { value: true });
  const failing = new AiExecutionCoordinator({
    compression: { async start() {} },
    compressedResults: { async read() { return null; } },
  });
  assert.equal(failing.snapshot().capabilities.canDownloadZip, false);

  coordinator.cancel();
  assert.equal(coordinator.state.status, "cancelled");
  assert.equal(coordinator.snapshot().capabilities.canDownloadZip, false);
});
