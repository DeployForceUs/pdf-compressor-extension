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

await writeFile(routerPath, router, "utf8");
process.stdout.write("AI Lab rendered-plan fallback revision F1 applied\n");
