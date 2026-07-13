import assert from "node:assert/strict";
import { formatBytes } from "../src/lib/i18n/helpers";
import { buildSelectedPdfDisplay, formatSplitWarningsHeader } from "../src/entrypoints/popup/pdf-display";
import { readPdfRecord, writePdfRecord, deletePdfRecord } from "../src/lib/storage/pdf-records-db";
import type { PdfRecord, SelectedPdfSnapshot } from "../src/lib/messaging";

function createTranslator(locale: "en" | "es") {
  return (key: string, options?: Record<string, unknown>) => {
    const count = typeof options?.count === "number" ? options.count : undefined;

    const tables: Record<string, Record<string, string>> = {
      en: {
        "split.warnings.title_one": "1 warning",
        "split.warnings.title_other": `${count ?? 0} warnings`,
        "pdfInput.fileName": "File name",
        "pdfInput.pages": "Pages",
        "pdfInput.validationStatus": "Validation status",
        "pdfInput.selectedState": "Selected state",
        "pdfInput.ready": "Ready",
        "pdfInput.validating": "Validating...",
        "pdfInput.idle": "Idle",
        "pdfInput.invalidPdf": "Invalid PDF",
        "pdfInput.selected": "Selected",
        "pdfInput.notSelected": "Not selected",
      },
      es: {
        "split.warnings.title_one": "1 advertencia",
        "split.warnings.title_other": `${count ?? 0} advertencias`,
        "pdfInput.fileName": "Nombre",
        "pdfInput.pages": "Páginas",
        "pdfInput.validationStatus": "Estado de validación",
        "pdfInput.selectedState": "Estado de selección",
        "pdfInput.ready": "Listo",
        "pdfInput.validating": "Validando...",
        "pdfInput.idle": "Inactivo",
        "pdfInput.invalidPdf": "PDF inválido",
        "pdfInput.selected": "Seleccionado",
        "pdfInput.notSelected": "No seleccionado",
      },
    };

    if (key === "split.warnings.title") {
      return count === 1 ? tables[locale]["split.warnings.title_one"] : tables[locale]["split.warnings.title_other"];
    }

    return tables[locale][key] ?? key;
  };
}

function makePdfSnapshot(overrides: Partial<SelectedPdfSnapshot>): SelectedPdfSnapshot {
  return {
    status: "ready",
    selected: true,
    fileName: "example.pdf",
    fileSize: 5756013,
    pageCount: 220,
    mimeType: "application/pdf",
    recordId: "selected",
    storedByteLength: 5756013,
    readBackByteLength: 5756013,
    error: "",
    ...overrides,
  };
}

{
  const enT = createTranslator("en");
  const esT = createTranslator("es");

  assert.equal(formatSplitWarningsHeader(1, enT), "1 warning");
  assert.equal(formatSplitWarningsHeader(4, enT), "4 warnings");
  assert.equal(formatSplitWarningsHeader(1, esT), "1 advertencia");
  assert.equal(formatSplitWarningsHeader(4, esT), "4 advertencias");
}

{
  const snapshot = makePdfSnapshot({});
  const display = buildSelectedPdfDisplay(snapshot, "en-US", createTranslator("en"));

  assert.equal(display.badge, formatBytes(5756013, "en-US"));
  assert.deepEqual(display.rows.map((row) => row.label), [
    "File name",
    "Pages",
    "Validation status",
    "Selected state",
  ]);
  assert.deepEqual(display.rows.map((row) => row.value), [
    "example.pdf",
    "220",
    "Ready",
    "Selected",
  ]);
}

{
  const snapshot = makePdfSnapshot({ pageCount: null, selected: false, status: "idle", fileName: null, fileSize: 0 });
  const display = buildSelectedPdfDisplay(snapshot, "en-US", createTranslator("en"));

  assert.equal(display.badge, "");
  assert.equal(display.rows.find((row) => row.label === "Pages")?.value, "—");
}

{
  const snapshot = makePdfSnapshot({});
  const display = buildSelectedPdfDisplay(snapshot, "es-ES", createTranslator("es"));

  assert.deepEqual(display.rows.map((row) => row.label), [
    "Nombre",
    "Páginas",
    "Estado de validación",
    "Estado de selección",
  ]);
  assert.deepEqual(display.rows.map((row) => row.value), [
    "example.pdf",
    "220",
    "Listo",
    "Seleccionado",
  ]);
}

{
  const record: PdfRecord = {
    id: "selected",
    name: "restored.pdf",
    size: 5756013,
    type: "application/pdf",
    lastModified: 0,
    pageCount: 220,
    data: [1, 2, 3, 4],
  };

  await writePdfRecord(record);
  const restored = await readPdfRecord(record.id);
  assert.ok(restored);
  assert.equal(restored?.pageCount, 220);

  const display = buildSelectedPdfDisplay(
    makePdfSnapshot({
      fileName: restored?.name ?? null,
      fileSize: restored?.size ?? 0,
      pageCount: restored?.pageCount ?? null,
      selected: true,
      status: "ready",
    }),
    "en-US",
    createTranslator("en"),
  );

  assert.equal(display.rows.find((row) => row.label === "Pages")?.value, "220");
  await deletePdfRecord(record.id);
}

console.log("phase5 slice 11 split UI metadata assertions passed");
