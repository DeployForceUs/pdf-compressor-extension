function requirePositiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${field} must be a positive safe integer`);
  }
}

export function evaluateOutputArtifact({
  inputBytes,
  inputPageCount,
  outputBytes,
  outputPageCount,
  outputOpens,
}) {
  requirePositiveInteger(inputBytes, "inputBytes");
  requirePositiveInteger(inputPageCount, "inputPageCount");
  requirePositiveInteger(outputBytes, "outputBytes");
  requirePositiveInteger(outputPageCount, "outputPageCount");

  if (outputOpens !== true) {
    return { action: "retain_original", reason: "output_invalid" };
  }

  if (outputPageCount !== inputPageCount) {
    return { action: "retain_original", reason: "page_count_mismatch" };
  }

  if (outputBytes >= inputBytes) {
    return { action: "retain_original", reason: "not_smaller" };
  }

  return {
    action: "accept_output",
    reason: "validated_smaller_output",
    savedBytes: inputBytes - outputBytes,
  };
}
