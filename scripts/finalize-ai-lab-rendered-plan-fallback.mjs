import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const routerPath = path.resolve(
  ".output/chrome-mv3-ai-lab/ai-lab-execution-router.js",
);

let router = await readFile(routerPath, "utf8");

router = router.replaceAll(
  "targetSizeFromButtonContext",
  "targetSizeFromRenderedPlan",
);

if (!router.includes("function targetSizeFromRenderedPlan(")) {
  throw new Error("Rendered-plan target-size fallback was not generated");
}

if (!router.includes("targetSizeFromRenderedPlan(button)")) {
  throw new Error("Rendered-plan target-size fallback is not used by the router");
}

const workflowBoundary = `  async function continueTargetSizeWorkflow(result, resultKind = "compressed") {
    completedResult = result ?? null;
    if (!activeTargetPartSizeMb) {
      renderComplete(result);
      return;
    }`;

const workflowReplacement = `  async function continueTargetSizeWorkflow(result, resultKind = "compressed") {
    completedResult = result ?? null;
    activeTargetPartSizeMb =
      activeTargetPartSizeMb ??
      targetSizeFromPlannerResult(globalThis.__AI_LAB_LAST_PLANNER_RESULT__) ??
      (activeButton ? targetSizeFromRenderedPlan(activeButton) : null);
    emit({
      status: "target_size_recovered_at_completion",
      targetPartSizeMb: activeTargetPartSizeMb,
    });
    if (!activeTargetPartSizeMb) {
      renderComplete(result);
      return;
    }`;

if (!router.includes(workflowReplacement)) {
  if (!router.includes(workflowBoundary)) {
    throw new Error("Target-size completion recovery boundary was not found");
  }
  router = router.replace(workflowBoundary, workflowReplacement);
}

await writeFile(routerPath, router, "utf8");
process.stdout.write("AI Lab rendered-plan fallback revision F2 applied\n");
