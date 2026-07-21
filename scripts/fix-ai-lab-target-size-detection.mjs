import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve(".output/chrome-mv3-ai-lab");
const presenterPath = path.join(outputDir, "ai-lab-recommendation-presenter.js");

let presenter = await readFile(presenterPath, "utf8");

const boundary = `    visit(orchestration?.userGoal);
    visit(orchestration?.plannerRequest?.userGoal);`;
const replacement = `    visit(orchestration?.userGoal);
    visit(orchestration?.plannerRequest?.userGoal);
    visit(response?.explanation);
    visit(response?.processingPlan);`;

if (!presenter.includes(replacement)) {
  if (!presenter.includes(boundary)) {
    throw new Error("AI Lab target-size detection boundary not found");
  }
  presenter = presenter.replace(boundary, replacement);
}

await writeFile(presenterPath, presenter, "utf8");
process.stdout.write("AI Lab target-size detection expanded to Planner response\n");
