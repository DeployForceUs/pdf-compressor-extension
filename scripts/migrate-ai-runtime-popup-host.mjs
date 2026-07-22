import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve("src/entrypoints/popup/main.tsx");
let source = readFileSync(file, "utf8");

if (source.includes("AiRuntimePopupHost")) {
  console.log("[AI Runtime] popup host already integrated");
  process.exit(0);
}

const importAnchor = 'import { SmartPlannerPreparationCard } from "./SmartPlannerPreparationCard";';
if (!source.includes(importAnchor)) {
  throw new Error("popup host migration import anchor not found");
}
source = source.replace(
  importAnchor,
  `${importAnchor}\nimport { AiRuntimePopupHost } from "./AiRuntimePopupHost";`,
);

const plannerPattern = /(\s*<SmartPlannerPreparationCard[\s\S]*?\/>)/m;
if (!plannerPattern.test(source)) {
  throw new Error("popup host migration planner mount anchor not found");
}
source = source.replace(plannerPattern, `$1\n\n            <AiRuntimePopupHost />`);

writeFileSync(file, source);
console.log("[AI Runtime] popup host integrated into source main.tsx");
