import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve(".output/chrome-mv3-ai-lab");
const presenterPath = path.join(outputDir, "ai-lab-recommendation-presenter.js");

let presenter = await readFile(presenterPath, "utf8");

const sourceBoundary = `    visit(orchestration?.userGoal);
    visit(orchestration?.plannerRequest?.userGoal);`;
const sourceReplacement = `    visit(orchestration?.userGoal);
    visit(orchestration?.plannerRequest?.userGoal);
    visit(response?.explanation);
    visit(response?.processingPlan);`;

if (!presenter.includes(sourceReplacement)) {
  if (!presenter.includes(sourceBoundary)) {
    throw new Error("AI Lab target-size detection source boundary not found");
  }
  presenter = presenter.replace(sourceBoundary, sourceReplacement);
}

const looseDetectionBoundary = `    for (const value of values) {
      const match = value.match(/(?:under|below|to|target(?:ing)?|maximum|max)?\\s*(\\d+(?:\\.\\d+)?)\\s*MB\\b/i);
      if (match) return Number(match[1]);
    }
    return null;`;

const contextualDetectionReplacement = `    const contextualPatterns = [
      /(?:under|below|maximum|max(?:imum)?(?: size)?|target(?: size|ing)?|limit(?: of)?|portal target(?: of)?)\\s*[:=-]?\\s*(\\d+(?:\\.\\d+)?)\\s*MB\\b/i,
      /(\\d+(?:\\.\\d+)?)\\s*MB\\s*(?:portal )?(?:target|limit|maximum|max)\\b/i,
      /(?:split|parts?)\\s+(?:into|under|below|to)?\\s*(\\d+(?:\\.\\d+)?)\\s*MB\\b/i,
    ];
    for (const value of values) {
      for (const pattern of contextualPatterns) {
        const match = value.match(pattern);
        if (match) return Number(match[1]);
      }
    }
    return null;`;

if (!presenter.includes(contextualDetectionReplacement)) {
  if (!presenter.includes(looseDetectionBoundary)) {
    throw new Error("AI Lab contextual target-size detection boundary not found");
  }
  presenter = presenter.replace(looseDetectionBoundary, contextualDetectionReplacement);
}

await writeFile(presenterPath, presenter, "utf8");
process.stdout.write("AI Lab target-size detection restricted to delivery-limit context\n");
