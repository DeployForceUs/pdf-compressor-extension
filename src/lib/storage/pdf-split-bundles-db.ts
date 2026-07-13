import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { SPLIT_PDF_RECORD_ID } from "../pdf-records";
import { readPdfRecord } from "./pdf-records-db";
import type {
  SplitArtifactDescriptor,
  SplitArtifactRecord,
  SplitResultBundle,
  SplitResultRecord,
} from "../messaging";
import { SplitRuntimeError } from "../pdf/split-errors";

const DB_NAME = "pdf-compressor-phase5";
const DB_VERSION = 2;
const LEGACY_STORE = "split-results";
const BUNDLE_STORE = "split-result-bundles";
const ARTIFACT_STORE = "split-artifacts";

type SplitStoreName = typeof LEGACY_STORE | typeof BUNDLE_STORE | typeof ARTIFACT_STORE;

interface SplitResultsDbSchema extends DBSchema {
  [LEGACY_STORE]: {
    key: string;
    value: SplitResultRecord;
  };
  [BUNDLE_STORE]: {
    key: string;
    value: SplitResultBundle;
  };
  [ARTIFACT_STORE]: {
    key: string;
    value: SplitArtifactRecord;
  };
}

type SplitResultsDb = IDBPDatabase<SplitResultsDbSchema>;

type SplitResultsMemoryState = {
  legacy: Map<string, SplitResultRecord>;
  bundles: Map<string, SplitResultBundle>;
  artifacts: Map<string, SplitArtifactRecord>;
};

type SplitResultsObjectStore = {
  put: (value: unknown) => Promise<unknown>;
  delete: (key: string) => Promise<unknown>;
};

export type SplitResultsStoreWriteStep = {
  store: SplitStoreName;
  phase: "pending" | "complete";
  key: string;
};

export type SplitResultsStoreTestHooks = {
  failOnWrite?: (step: SplitResultsStoreWriteStep) => void;
  beforeCommit?: (bundle: SplitResultBundle, artifacts: SplitArtifactRecord[]) => void | Promise<void>;
};

type SplitResultsStoreBackend = {
  readLegacy: (recordId: string) => Promise<SplitResultRecord | null>;
  writeLegacy: (record: SplitResultRecord) => Promise<SplitResultRecord>;
  deleteLegacy: (recordId: string) => Promise<boolean>;
  readBundle: (bundleId: string) => Promise<SplitResultBundle | null>;
  readArtifact: (artifactId: string) => Promise<SplitArtifactRecord | null>;
  readArtifactsForBundle: (bundleId: string) => Promise<SplitArtifactRecord[] | null>;
  writeBundleAndArtifacts: (bundle: SplitResultBundle, artifacts: SplitArtifactRecord[]) => Promise<SplitResultBundle>;
  deleteBundle: (bundleId: string) => Promise<boolean>;
  deleteArtifact: (artifactId: string) => Promise<boolean>;
};

function isQuotaExceededError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.code === 22 || error.code === 1014)
  );
}

function normalizePersistenceError(error: unknown): never {
  if (isQuotaExceededError(error)) {
    throw new SplitRuntimeError("STORAGE_QUOTA_EXCEEDED", "Split result could not be persisted because storage quota was exceeded");
  }

  throw error;
}

function safeAbortTransaction(transaction: { abort: () => void }) {
  try {
    transaction.abort();
  } catch {
    // The transaction may already be inactive or aborted.
  }
}

function createMemoryState(): SplitResultsMemoryState {
  return {
    legacy: new Map<string, SplitResultRecord>(),
    bundles: new Map<string, SplitResultBundle>(),
    artifacts: new Map<string, SplitArtifactRecord>(),
  };
}

function cloneMap<T>(input: Map<string, T>) {
  return new Map<string, T>(input);
}

function createMemoryBackend(state: SplitResultsMemoryState, hooks: SplitResultsStoreTestHooks = {}): SplitResultsStoreBackend {
  function maybeFail(step: SplitResultsStoreWriteStep) {
    hooks.failOnWrite?.(step);
  }

  return {
    async readLegacy(recordId: string) {
      return state.legacy.get(recordId) ?? null;
    },
    async writeLegacy(record: SplitResultRecord) {
      maybeFail({ store: LEGACY_STORE, phase: "complete", key: record.id });
      state.legacy.set(record.id, record);
      return record;
    },
    async deleteLegacy(recordId: string) {
      const existing = state.legacy.get(recordId);
      state.legacy.delete(recordId);
      return existing !== undefined;
    },
    async readBundle(bundleId: string) {
      const bundle = state.bundles.get(bundleId) ?? null;
      return bundle?.status === "complete" ? bundle : null;
    },
    async readArtifact(artifactId: string) {
      const artifact = state.artifacts.get(artifactId) ?? null;
      return artifact?.status === "complete" ? artifact : null;
    },
    async readArtifactsForBundle(bundleId: string) {
      const bundle = state.bundles.get(bundleId) ?? null;
      if (!bundle || bundle.status !== "complete") {
        return null;
      }

      const artifacts: SplitArtifactRecord[] = [];
      for (const artifactId of bundle.artifactIds) {
        const artifact = state.artifacts.get(artifactId) ?? null;
        if (!artifact || artifact.status !== "complete") {
          return null;
        }
        artifacts.push(artifact);
      }

      return artifacts;
    },
    async writeBundleAndArtifacts(bundle: SplitResultBundle, artifacts: SplitArtifactRecord[]) {
      try {
        const legacyDraft = cloneMap(state.legacy);
        const bundleDraft = cloneMap(state.bundles);
        const artifactDraft = cloneMap(state.artifacts);

        const now = Date.now();
        const pendingBundle: SplitResultBundle = {
          ...bundle,
          artifactIds: [...bundle.artifactIds],
          status: "pending",
          createdAt: bundle.createdAt ?? now,
          updatedAt: now,
          totalArtifactSize: artifacts.reduce((total, artifact) => total + artifact.byteLength, 0),
        };

        const pendingArtifacts = artifacts.map<SplitArtifactRecord>((artifact) => ({
          ...artifact,
          data: artifact.data,
          status: "pending",
          createdAt: artifact.createdAt ?? now,
          updatedAt: now,
        }));

        maybeFail({ store: BUNDLE_STORE, phase: "pending", key: bundle.id });
        bundleDraft.set(bundle.id, pendingBundle);

        for (const artifact of pendingArtifacts) {
          maybeFail({ store: ARTIFACT_STORE, phase: "pending", key: artifact.id });
          artifactDraft.set(artifact.id, artifact);
        }

        await hooks.beforeCommit?.(pendingBundle, pendingArtifacts);

        const completeBundle: SplitResultBundle = {
          ...pendingBundle,
          status: "complete",
          updatedAt: now,
        };
        const completeArtifacts = pendingArtifacts.map<SplitArtifactRecord>((artifact) => ({
          ...artifact,
          status: "complete",
          updatedAt: now,
        }));

        maybeFail({ store: BUNDLE_STORE, phase: "complete", key: bundle.id });
        bundleDraft.set(bundle.id, completeBundle);

        for (const artifact of completeArtifacts) {
          maybeFail({ store: ARTIFACT_STORE, phase: "complete", key: artifact.id });
          artifactDraft.set(artifact.id, artifact);
        }

        maybeFail({ store: LEGACY_STORE, phase: "complete", key: bundle.id });
        legacyDraft.delete(bundle.id);

        state.legacy = legacyDraft;
        state.bundles = bundleDraft;
        state.artifacts = artifactDraft;

        return completeBundle;
      } catch (error) {
        normalizePersistenceError(error);
      }
    },
    async deleteBundle(bundleId: string) {
      const bundle = state.bundles.get(bundleId) ?? null;
      const legacy = state.legacy.get(bundleId) ?? null;
      let deleted = false;

      if (bundle) {
        for (const artifactId of bundle.artifactIds) {
          deleted = state.artifacts.delete(artifactId) || deleted;
        }
        deleted = state.bundles.delete(bundleId) || deleted;
      }

      deleted = state.legacy.delete(bundleId) || deleted;
      return deleted || legacy !== null;
    },
    async deleteArtifact(artifactId: string) {
      const deleted = state.artifacts.delete(artifactId);
      state.legacy.delete(artifactId);
      return deleted;
    },
  };
}

async function openDb(): Promise<SplitResultsDb> {
  return openDB<SplitResultsDbSchema>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(LEGACY_STORE)) {
        database.createObjectStore(LEGACY_STORE, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(BUNDLE_STORE)) {
        database.createObjectStore(BUNDLE_STORE, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(ARTIFACT_STORE)) {
        database.createObjectStore(ARTIFACT_STORE, { keyPath: "id" });
      }
    },
  });
}

async function createIndexedDbBackend(hooks: SplitResultsStoreTestHooks = {}): Promise<SplitResultsStoreBackend> {
  const db = await openDb();

  async function readLegacy(recordId: string) {
    return (await db.get(LEGACY_STORE, recordId)) ?? null;
  }

  async function writeLegacy(record: SplitResultRecord) {
    try {
      await db.put(LEGACY_STORE, record);
      return record;
    } catch (error) {
      normalizePersistenceError(error);
    }
  }

  async function deleteLegacy(recordId: string) {
    const existing = await db.get(LEGACY_STORE, recordId);
    await db.delete(LEGACY_STORE, recordId);
    return existing !== undefined;
  }

  async function readBundle(bundleId: string) {
    const bundle = await db.get(BUNDLE_STORE, bundleId);
    return bundle?.status === "complete" ? bundle : null;
  }

  async function readArtifact(artifactId: string) {
    const artifact = await db.get(ARTIFACT_STORE, artifactId);
    return artifact?.status === "complete" ? artifact : null;
  }

  async function readArtifactsForBundle(bundleId: string) {
    const bundle = await readBundle(bundleId);
    if (!bundle) {
      return null;
    }

    const artifacts: SplitArtifactRecord[] = [];
    for (const artifactId of bundle.artifactIds) {
      const artifact = await readArtifact(artifactId);
      if (!artifact) {
        return null;
      }
      artifacts.push(artifact);
    }

    return artifacts;
  }

  async function writeBundleAndArtifacts(bundle: SplitResultBundle, artifacts: SplitArtifactRecord[]) {
    const now = Date.now();
    const totalArtifactSize = artifacts.reduce((total, artifact) => total + artifact.byteLength, 0);
    let transaction: ReturnType<SplitResultsDb["transaction"]> | null = null;

    try {
      const pendingBundle: SplitResultBundle = {
        ...bundle,
        artifactIds: [...bundle.artifactIds],
        status: "pending",
        createdAt: bundle.createdAt ?? now,
        updatedAt: now,
        totalArtifactSize,
      };
      const pendingArtifacts = artifacts.map<SplitArtifactRecord>((artifact) => ({
        ...artifact,
        data: artifact.data,
        status: "pending",
        createdAt: artifact.createdAt ?? now,
        updatedAt: now,
      }));

      maybeFailOnWrite(hooks, { store: BUNDLE_STORE, phase: "pending", key: bundle.id });
      for (const artifact of pendingArtifacts) {
        maybeFailOnWrite(hooks, { store: ARTIFACT_STORE, phase: "pending", key: artifact.id });
      }

      if (hooks.beforeCommit) {
        await hooks.beforeCommit(pendingBundle, pendingArtifacts);
      }

      transaction = db.transaction([LEGACY_STORE, BUNDLE_STORE, ARTIFACT_STORE], "readwrite");
      const legacyStore = transaction.objectStore(LEGACY_STORE) as SplitResultsObjectStore;
      const bundleStore = transaction.objectStore(BUNDLE_STORE) as SplitResultsObjectStore;
      const artifactStore = transaction.objectStore(ARTIFACT_STORE) as SplitResultsObjectStore;

      const completeBundle: SplitResultBundle = {
        ...pendingBundle,
        status: "complete",
        updatedAt: now,
      };
      const completeArtifacts = pendingArtifacts.map<SplitArtifactRecord>((artifact) => ({
        ...artifact,
        status: "complete",
        updatedAt: now,
      }));

      maybeFailOnWrite(hooks, { store: BUNDLE_STORE, phase: "complete", key: bundle.id });
      const writeRequests: Array<Promise<unknown>> = [bundleStore.put(completeBundle)];

      for (const artifact of completeArtifacts) {
        maybeFailOnWrite(hooks, { store: ARTIFACT_STORE, phase: "complete", key: artifact.id });
        writeRequests.push(artifactStore.put(artifact));
      }

      maybeFailOnWrite(hooks, { store: LEGACY_STORE, phase: "complete", key: bundle.id });
      writeRequests.push(legacyStore.delete(bundle.id));

      await Promise.all(writeRequests);
      await transaction.done;
      return completeBundle;
    } catch (error) {
      if (transaction) {
        safeAbortTransaction(transaction);
      }
      normalizePersistenceError(error);
    }
  }

  async function deleteBundle(bundleId: string) {
    const transaction = db.transaction([LEGACY_STORE, BUNDLE_STORE, ARTIFACT_STORE], "readwrite");
    const legacyStore = transaction.objectStore(LEGACY_STORE);
    const bundleStore = transaction.objectStore(BUNDLE_STORE);
    const artifactStore = transaction.objectStore(ARTIFACT_STORE);

    try {
      const bundle = await bundleStore.get(bundleId);
      const legacy = await legacyStore.get(bundleId);
      let deleted = false;

      if (bundle) {
        for (const artifactId of bundle.artifactIds) {
          await artifactStore.delete(artifactId);
        }
        await bundleStore.delete(bundleId);
        deleted = true;
      }

      if (legacy) {
        await legacyStore.delete(bundleId);
        deleted = true;
      }

      await transaction.done;
      return deleted;
    } catch (error) {
      safeAbortTransaction(transaction);
      normalizePersistenceError(error);
    }
  }

  async function deleteArtifact(artifactId: string) {
    const transaction = db.transaction([LEGACY_STORE, ARTIFACT_STORE], "readwrite");
    const legacyStore = transaction.objectStore(LEGACY_STORE);
    const artifactStore = transaction.objectStore(ARTIFACT_STORE);

    try {
      const artifact = await artifactStore.get(artifactId);
      const legacy = await legacyStore.get(artifactId);
      let deleted = false;

      if (artifact) {
        await artifactStore.delete(artifactId);
        deleted = true;
      }

      if (legacy) {
        await legacyStore.delete(artifactId);
        deleted = true;
      }

      await transaction.done;
      return deleted;
    } catch (error) {
      safeAbortTransaction(transaction);
      normalizePersistenceError(error);
    }
  }

  return {
    readLegacy,
    writeLegacy,
    deleteLegacy,
    readBundle,
    readArtifact,
    readArtifactsForBundle,
    writeBundleAndArtifacts,
    deleteBundle,
    deleteArtifact,
  };
}

function maybeFailOnWrite(hooks: SplitResultsStoreTestHooks, step: SplitResultsStoreWriteStep) {
  hooks.failOnWrite?.(step);
}

function sanitizeArtifactId(artifactId: string) {
  const trimmed = artifactId.trim();
  if (!trimmed) {
    throw new SplitRuntimeError("SPLIT_FAILED", "Artifact id must be a non-empty string");
  }

  return trimmed;
}

function buildBundleFromLegacyRecord(record: SplitResultRecord, sourceFileName: string): SplitResultBundle {
  return {
    id: record.id,
    sourceRecordId: record.sourceRecordId,
    sourceFileName,
    outputMode: "single-zip",
    strategy: record.strategy,
    partsCount: record.partsCount,
    originalSize: record.originalSize,
    totalArtifactSize: record.data.byteLength,
    warnings: record.warnings ?? [],
    artifactIds: [record.id],
    compressAfterRequested: record.compressAfterRequested,
    originalSplitPartsSize: record.originalSplitPartsSize,
    finalPartsSize: record.finalPartsSize,
    compressedPartsCount: record.compressedPartsCount,
    fallbackPartsCount: record.fallbackPartsCount,
    totalBytesSaved: record.totalBytesSaved,
    status: "complete",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function buildArtifactFromLegacyRecord(record: SplitResultRecord, bundleId: string): SplitArtifactRecord {
  return {
    id: record.id,
    bundleId,
    kind: "zip",
    filename: record.fileName,
    mimeType: record.mimeType === "application/zip" ? "application/zip" : "application/zip",
    byteLength: record.data.byteLength,
    status: "complete",
    data: record.data,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function buildLegacyRecordFromBundle(bundle: SplitResultBundle, artifact: SplitArtifactRecord): SplitResultRecord {
  return {
    id: bundle.id,
    sourceRecordId: bundle.sourceRecordId,
    fileName: artifact.filename,
    mimeType: artifact.mimeType,
    compressAfterRequested: bundle.compressAfterRequested,
    originalSplitPartsSize: bundle.originalSplitPartsSize,
    finalPartsSize: bundle.finalPartsSize,
    compressedPartsCount: bundle.compressedPartsCount,
    fallbackPartsCount: bundle.fallbackPartsCount,
    totalBytesSaved: bundle.totalBytesSaved,
    originalSize: bundle.originalSize,
    totalPartsSize: bundle.totalArtifactSize,
    partsCount: bundle.partsCount,
    strategy: bundle.strategy,
    warnings: bundle.warnings,
    data: artifact.data,
    createdAt: bundle.createdAt,
    updatedAt: bundle.updatedAt,
  };
}

function createStoreHooks(hooks: SplitResultsStoreTestHooks = {}) {
  return hooks;
}

async function createBackend(hooks: SplitResultsStoreTestHooks = {}): Promise<SplitResultsStoreBackend> {
  if (typeof indexedDB === "undefined") {
    return createMemoryBackend(createMemoryState(), hooks);
  }

  return createIndexedDbBackend(hooks);
}

export function createSplitResultsStore(hooks: SplitResultsStoreTestHooks = {}) {
  const backendPromise = createBackend(createStoreHooks(hooks));

  return {
    async readLegacySplitResult(recordId = SPLIT_PDF_RECORD_ID) {
      return (await (await backendPromise).readLegacy(recordId)) ?? null;
    },
    async writeLegacySplitResult(record: SplitResultRecord) {
      return (await (await backendPromise).writeLegacy(record)) ?? record;
    },
    async deleteLegacySplitResult(recordId = SPLIT_PDF_RECORD_ID) {
      return (await (await backendPromise).deleteLegacy(recordId)) ?? false;
    },
    async readSplitResultBundle(recordId = SPLIT_PDF_RECORD_ID) {
      const backend = await backendPromise;
      const bundle = await backend.readBundle(recordId);
      if (bundle) {
        const artifacts = await backend.readArtifactsForBundle(bundle.id);
        return artifacts ? bundle : null;
      }

      const legacyRecord = await backend.readLegacy(recordId);
      if (!legacyRecord) {
        return null;
      }

      const sourceRecord = await readPdfRecord(legacyRecord.sourceRecordId);
      const sourceFileName = sourceRecord?.name ?? legacyRecord.fileName;
      return buildBundleFromLegacyRecord(legacyRecord, sourceFileName);
    },
    async readSplitArtifact(artifactId: string) {
      const backend = await backendPromise;
      const normalizedArtifactId = sanitizeArtifactId(artifactId);
      const artifact = await backend.readArtifact(normalizedArtifactId);
      if (artifact) {
        return artifact;
      }

      const legacyRecord = await backend.readLegacy(normalizedArtifactId);
      if (!legacyRecord) {
        return null;
      }

      return buildArtifactFromLegacyRecord(legacyRecord, normalizedArtifactId);
    },
    async readSplitArtifactsForBundle(bundleId: string) {
      const backend = await backendPromise;
      const bundle = await backend.readBundle(bundleId);
      if (bundle) {
        const artifacts = await backend.readArtifactsForBundle(bundle.id);
        return artifacts ?? null;
      }

      const legacyRecord = await backend.readLegacy(bundleId);
      if (!legacyRecord) {
        return null;
      }

      const artifact = buildArtifactFromLegacyRecord(legacyRecord, bundleId);
      return artifact ? [artifact] : null;
    },
    async writeSplitResultBundle(bundle: SplitResultBundle, artifacts: SplitArtifactRecord[]) {
      const backend = await backendPromise;
      if (!bundle.artifactIds.length || bundle.artifactIds.length !== artifacts.length) {
        throw new SplitRuntimeError("SPLIT_FAILED", "Bundle artifact manifest does not match the artifact payload");
      }

      const sortedArtifactIds = [...bundle.artifactIds];
      const actualArtifactIds = artifacts.map((artifact) => artifact.id);
      if (sortedArtifactIds.some((id, index) => id !== actualArtifactIds[index])) {
        throw new SplitRuntimeError("SPLIT_FAILED", "Bundle artifact ids do not match the artifact payload");
      }

      return backend.writeBundleAndArtifacts(bundle, artifacts);
    },
    async deleteSplitResultBundle(bundleId = SPLIT_PDF_RECORD_ID) {
      const backend = await backendPromise;
      return backend.deleteBundle(bundleId);
    },
    async deleteSplitArtifact(artifactId: string) {
      const backend = await backendPromise;
      return backend.deleteArtifact(sanitizeArtifactId(artifactId));
    },
    async readSplitResult(recordId = SPLIT_PDF_RECORD_ID) {
      const backend = await backendPromise;
      const bundle = await backend.readBundle(recordId);
      if (bundle) {
        const artifacts = await backend.readArtifactsForBundle(bundle.id);
        if (!artifacts || bundle.outputMode !== "single-zip" || artifacts.length !== 1) {
          return null;
        }

        return buildLegacyRecordFromBundle(bundle, artifacts[0]);
      }

      return (await backend.readLegacy(recordId)) ?? null;
    },
    async writeSplitResult(record: SplitResultRecord) {
      const sourceRecord = await readPdfRecord(record.sourceRecordId);
      const sourceFileName = sourceRecord?.name ?? record.fileName;
      const bundle = buildBundleFromLegacyRecord(record, sourceFileName);
      const artifact = buildArtifactFromLegacyRecord(record, record.id);

      await (await backendPromise).writeBundleAndArtifacts(bundle, [artifact]);
      return record;
    },
    async deleteSplitResult(recordId = SPLIT_PDF_RECORD_ID) {
      const backend = await backendPromise;
      const deletedBundle = await backend.deleteBundle(recordId);
      const deletedLegacy = await backend.deleteLegacy(recordId);
      return deletedBundle || deletedLegacy;
    },
  };
}

const defaultSplitResultsStore = createSplitResultsStore();

export async function readLegacySplitResult(recordId = SPLIT_PDF_RECORD_ID) {
  return defaultSplitResultsStore.readLegacySplitResult(recordId);
}

export async function writeLegacySplitResult(record: SplitResultRecord) {
  return defaultSplitResultsStore.writeLegacySplitResult(record);
}

export async function deleteLegacySplitResult(recordId = SPLIT_PDF_RECORD_ID) {
  return defaultSplitResultsStore.deleteLegacySplitResult(recordId);
}

export async function readSplitResultBundle(recordId = SPLIT_PDF_RECORD_ID) {
  return defaultSplitResultsStore.readSplitResultBundle(recordId);
}

export async function readSplitArtifact(artifactId: string) {
  return defaultSplitResultsStore.readSplitArtifact(artifactId);
}

export async function readSplitArtifactsForBundle(bundleId: string) {
  return defaultSplitResultsStore.readSplitArtifactsForBundle(bundleId);
}

export async function writeSplitResultBundle(bundle: SplitResultBundle, artifacts: SplitArtifactRecord[]) {
  return defaultSplitResultsStore.writeSplitResultBundle(bundle, artifacts);
}

export async function deleteSplitResultBundle(recordId = SPLIT_PDF_RECORD_ID) {
  return defaultSplitResultsStore.deleteSplitResultBundle(recordId);
}

export async function deleteSplitArtifact(artifactId: string) {
  return defaultSplitResultsStore.deleteSplitArtifact(artifactId);
}

export async function readSplitResult(recordId = SPLIT_PDF_RECORD_ID) {
  return defaultSplitResultsStore.readSplitResult(recordId);
}

export async function writeSplitResult(record: SplitResultRecord) {
  return defaultSplitResultsStore.writeSplitResult(record);
}

export async function deleteSplitResult(recordId = SPLIT_PDF_RECORD_ID) {
  return defaultSplitResultsStore.deleteSplitResult(recordId);
}
