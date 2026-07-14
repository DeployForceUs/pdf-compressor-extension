import assert from "node:assert/strict";
import {
  COMPRESSION_QUALITY_STORAGE_KEY,
  DEFAULT_COMPRESSION_QUALITY,
  createCompressionQualityStorage,
  normalizeCompressionQuality,
} from "../src/lib/compression-quality";
import {
  DEVICE_MEMORY_FALLBACK_GB,
  FREE_MAX_PDF_BYTES,
  PRO_MAX_PDF_BYTES,
  getDeviceMemoryGb,
  getMaxPdfBytes,
  normalizeDeviceMemoryGb,
} from "../src/lib/pdf-size-policy";

assert.equal(normalizeCompressionQuality(undefined), DEFAULT_COMPRESSION_QUALITY);
assert.equal(normalizeCompressionQuality(4), 10);
assert.equal(normalizeCompressionQuality(72.6), 73);
assert.equal(normalizeCompressionQuality(140), 100);

const values: Record<string, unknown> = {};
const qualityStorage = createCompressionQualityStorage({
  async get(key) {
    return { [key]: values[key] };
  },
  async set(items) {
    Object.assign(values, items);
  },
});

assert.equal(await qualityStorage.read(), DEFAULT_COMPRESSION_QUALITY);
assert.equal(await qualityStorage.write(85), 85);
assert.equal(values[COMPRESSION_QUALITY_STORAGE_KEY], 85);
assert.equal(await qualityStorage.read(), 85);

assert.equal(normalizeDeviceMemoryGb(undefined), DEVICE_MEMORY_FALLBACK_GB);
assert.equal(getDeviceMemoryGb({}), DEVICE_MEMORY_FALLBACK_GB);
assert.equal(getDeviceMemoryGb({ deviceMemory: 2 }), 2);
assert.equal(getMaxPdfBytes("free", 2), FREE_MAX_PDF_BYTES);
assert.equal(getMaxPdfBytes("free", 8), FREE_MAX_PDF_BYTES);
assert.equal(getMaxPdfBytes("pro", 2), FREE_MAX_PDF_BYTES);
assert.equal(getMaxPdfBytes("pro", 4), PRO_MAX_PDF_BYTES);
assert.equal(getMaxPdfBytes("pro", 8), PRO_MAX_PDF_BYTES);

console.info("phase7 quality and device policy assertions passed");
