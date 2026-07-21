import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const POPUP_PATH = "src/entrypoints/popup/main.tsx";

function insertOnce(source, anchor, insertion, label) {
  if (source.includes(insertion.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`Cannot apply ${label}: anchor not found`);
  return source.replace(anchor, `${insertion}${anchor}`);
}

function upgradePlannerProps(source) {
  if (source.includes("plannerBaseUrl={officeUrl}") && source.includes("plannerAccessToken={officeToken}")) return source;

  const marker = "officeAvailable={Boolean(officeHealth)}";
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error("Cannot apply Planner gateway props: existing Planner card anchor not found");

  const lineStart = source.lastIndexOf("\n", markerIndex) + 1;
  const indent = source.slice(lineStart, markerIndex);
  const insertAt = markerIndex + marker.length;
  return `${source.slice(0, insertAt)}\n${indent}plannerBaseUrl={officeUrl}\n${indent}plannerAccessToken={officeToken}${source.slice(insertAt)}`;
}

export function patchPopupSource(source) {
  let next = source;

  next = insertOnce(
    next,
    'import { LanguageSwitcher } from "../../components/LanguageSwitcher";\n',
    'import { SmartPlannerPreparationCard } from "./SmartPlannerPreparationCard";\n',
    "Planner component import",
  );

  const officePattern = /^(\s*)<article className=\{officeHealth \? "office-card office-card--ready" : "office-card"\}>/m;
  const match = next.match(officePattern);
  if (!match) throw new Error("Cannot apply Planner card placement: anchor not found");

  const indent = match[1] ?? "";
  const plannerMarkup = `${indent}<SmartPlannerPreparationCard\n${indent}  key={pdf.recordId ?? "no-pdf"}\n${indent}  pdfReady={Boolean(pdf.selected)}\n${indent}  officeAvailable={Boolean(officeHealth)}\n${indent}  plannerBaseUrl={officeUrl}\n${indent}  plannerAccessToken={officeToken}\n${indent}/>\n\n`;

  if (!next.includes("<SmartPlannerPreparationCard")) {
    next = next.replace(officePattern, `${plannerMarkup}${match[0]}`);
  } else {
    next = upgradePlannerProps(next);
  }

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
