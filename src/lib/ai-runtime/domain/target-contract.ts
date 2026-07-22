export type TargetOutputMode = "single-zip";

export interface TargetContract {
  readonly schemaVersion: "1";
  readonly contractId: string;
  readonly goalKind: "email" | "portal";
  readonly targetSizeMb: number;
  readonly targetBytes: number;
  readonly splitEnabled: true;
  readonly outputMode: TargetOutputMode;
}

export interface CreateTargetContractInput {
  readonly contractId: string;
  readonly goalKind: "email" | "portal";
  readonly targetSizeMb: number;
}

const BYTES_PER_MEGABYTE = 1024 * 1024;

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field}_required`);
}

function assertTargetSizeMb(value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error("targetSizeMb_invalid");
}

export function createTargetContract(input: CreateTargetContractInput): TargetContract {
  assertNonEmpty(input.contractId, "contractId");
  assertTargetSizeMb(input.targetSizeMb);

  const targetBytes = Math.floor(input.targetSizeMb * BYTES_PER_MEGABYTE);
  if (!Number.isSafeInteger(targetBytes) || targetBytes <= 0) throw new Error("targetBytes_invalid");

  return Object.freeze({
    schemaVersion: "1",
    contractId: input.contractId,
    goalKind: input.goalKind,
    targetSizeMb: input.targetSizeMb,
    targetBytes,
    splitEnabled: true,
    outputMode: "single-zip",
  });
}

export function assertTargetContract(value: unknown): asserts value is TargetContract {
  if (!value || typeof value !== "object") throw new Error("targetContract_invalid");
  const candidate = value as Partial<TargetContract>;
  if (candidate.schemaVersion !== "1") throw new Error("targetContract_schemaVersion_invalid");
  if (typeof candidate.contractId !== "string" || !candidate.contractId.trim()) throw new Error("targetContract_contractId_invalid");
  if (candidate.goalKind !== "email" && candidate.goalKind !== "portal") throw new Error("targetContract_goalKind_invalid");
  assertTargetSizeMb(candidate.targetSizeMb as number);
  if (!Number.isSafeInteger(candidate.targetBytes) || (candidate.targetBytes as number) <= 0) throw new Error("targetContract_targetBytes_invalid");
  if (candidate.splitEnabled !== true) throw new Error("targetContract_splitEnabled_invalid");
  if (candidate.outputMode !== "single-zip") throw new Error("targetContract_outputMode_invalid");
}
