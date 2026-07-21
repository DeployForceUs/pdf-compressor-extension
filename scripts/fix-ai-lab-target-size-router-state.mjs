import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const routerPath = path.resolve(
  ".output/chrome-mv3-ai-lab/ai-lab-execution-router.js",
);

let router = await readFile(routerPath, "utf8");

const stateAnchor = `  async function confirmExecution(button) {`;
const stateHelper = `  function targetSizeFromPlannerResult(plannerResult) {
    const response = plannerResult?.response;
    const explicit =
      response?.processingPlan?.split?.targetPartSizeMb ??
      response?.split?.targetPartSizeMb;
    if (Number.isFinite(explicit) && explicit > 0) return explicit;

    const text = [
      response?.explanation,
      plannerResult?.request?.userGoal?.deliveryTarget,
      plannerResult?.request?.userGoal?.instruction,
      globalThis.__AI_LAB_LAST_ORCHESTRATION__?.userGoal?.deliveryTarget,
      globalThis.__AI_LAB_LAST_ORCHESTRATION__?.userGoal?.instruction,
    ]
      .filter((value) => typeof value === "string")
      .join(" ");

    const patterns = [
      /(?:portal\s+target|delivery\s+limit|target(?:ing)?|maximum|max|under|below|parts?\s+under)\D{0,24}(\d+(?:\.\d+)?)\s*MB\b/i,
      /(\d+(?:\.\d+)?)\s*MB\b\D{0,24}(?:portal\s+target|delivery\s+limit|target|limit|maximum|max)/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return Number(match[1]);
    }
    return null;
  }

`;

if (!router.includes("function targetSizeFromPlannerResult(")) {
  if (!router.includes(stateAnchor)) {
    throw new Error("AI Lab router confirm anchor not found");
  }
  router = router.replace(stateAnchor, stateHelper + stateAnchor);
}

const assignmentBoundary = `    activeTargetPartSizeMb = Number.parseFloat(button.dataset.aiTargetPartSizeMb || "") || null;`;
const assignmentReplacement = `    activeTargetPartSizeMb =
      targetSizeFromPlannerResult(plannerResult) ??
      (Number.parseFloat(button.dataset.aiTargetPartSizeMb || "") || null);`;

if (!router.includes(assignmentReplacement)) {
  if (!router.includes(assignmentBoundary)) {
    throw new Error("AI Lab router target-size assignment boundary not found");
  }
  router = router.replace(assignmentBoundary, assignmentReplacement);
}

const workflowSignatureBoundary = `  async function continueTargetSizeWorkflow(result) {`;
const workflowSignatureReplacement = `  async function continueTargetSizeWorkflow(result, resultKind = "compressed") {`;
if (!router.includes(workflowSignatureReplacement)) {
  if (!router.includes(workflowSignatureBoundary)) {
    throw new Error("AI Lab target-size workflow signature boundary not found");
  }
  router = router.replace(workflowSignatureBoundary, workflowSignatureReplacement);
}

const withinTargetBoundary = `    if (actualBytes <= targetBytes) {
      renderComplete(result);
      return;
    }`;
const withinTargetReplacement = `    if (actualBytes <= targetBytes && resultKind !== "original") {
      renderComplete(result);
      return;
    }`;
if (!router.includes(withinTargetReplacement)) {
  if (!router.includes(withinTargetBoundary)) {
    throw new Error("AI Lab target-size completion boundary not found");
  }
  router = router.replace(withinTargetBoundary, withinTargetReplacement);
}

const officeCallBoundary = `        void continueTargetSizeWorkflow(message.result).catch((error) => {`;
const officeCallReplacement = `        void continueTargetSizeWorkflow(message.result, message.resultKind).catch((error) => {`;
if (!router.includes(officeCallReplacement)) {
  if (!router.includes(officeCallBoundary)) {
    throw new Error("AI Lab Office target-size call boundary not found");
  }
  router = router.replace(officeCallBoundary, officeCallReplacement);
}

await writeFile(routerPath, router, "utf8");
process.stdout.write("AI Lab target-size router state fixed\n");
