import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const outDir = resolve(root, ".tmp-ai-runtime-react-ui");
const tsc = resolve(root, "node_modules/typescript/bin/tsc");

rmSync(outDir, { recursive: true, force: true });

try {
  execFileSync(process.execPath, [
    tsc,
    "--target", "ES2022",
    "--module", "NodeNext",
    "--moduleResolution", "NodeNext",
    "--jsx", "react-jsx",
    "--strict",
    "--skipLibCheck",
    "--types", "node,react,react-dom",
    "--rootDir", ".",
    "--outDir", outDir,
    "src/lib/ai-runtime/domain/target-contract.ts",
    "src/lib/ai-runtime/domain/execution-errors.ts",
    "src/lib/ai-runtime/domain/execution-events.ts",
    "src/lib/ai-runtime/domain/execution-state.ts",
    "src/lib/ai-runtime/ports.ts",
    "src/lib/ai-runtime/execution-coordinator.ts",
    "src/lib/ai-runtime/ui/execution-view-model.ts",
    "src/entrypoints/popup/AiRuntimeExecutionPanel.tsx",
    "tests/phase19_ai_runtime_react_ui.test.tsx",
  ], { cwd: root, stdio: "inherit" });

  execFileSync(process.execPath, [
    "--test",
    resolve(outDir, "tests/phase19_ai_runtime_react_ui.test.js"),
  ], { cwd: root, stdio: "inherit" });
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
