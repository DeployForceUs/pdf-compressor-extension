import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const POPUP_PATH = "src/entrypoints/popup/main.tsx";

function insertOnce(source, anchor, insertion, label) {
  if (source.includes(insertion.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`Cannot apply ${label}: anchor not found`);
  return source.replace(anchor, `${insertion}${anchor}`);
}

export function patchPopupSource(source) {
  let next = source;

  next = insertOnce(
    next,
    'import { LanguageSwitcher } from "../../components/LanguageSwitcher";\n',
    'import { SmartPlannerPreparationCard } from "./SmartPlannerPreparationCard";\n',
    "Planner component import",
  );

  const officeAnchor = '            <article className={officeHealth ? "office-card office-card--ready" : "office-card"}>\n';
  const plannerMarkup = `            <SmartPlannerPreparationCard\n              key={pdf.recordId ?? "no-pdf"}\n              pdfReady={Boolean(pdf.selected)}\n              officeAvailable={Boolean(officeHealth)}\n            />\n\n`;

  next = insertOnce(next, officeAnchor, plannerMarkup, "Planner card placement");
  return next;
}

async function applyToRepository(rootDir) {
  const popupPath = path.join(rootDir, POPUP_PATH);
  const source = await readFile(popupPath, "utf8");
  const patched = patchPopupSource(source);
  await writeFile(popupPath, patched);
  return { popupChanged: patched !== source, popupPath: POPUP_PATH };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const currentPath = fileURLToPath(import.meta.url);

if (invokedPath === currentPath) {
  const rootDir = path.resolve(path.dirname(currentPath), "..");
  console.log(JSON.stringify(await applyToRepository(rootDir)));
}
