import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const outDir = resolve(root, ".tmp-ai-runtime-network");
const tsc = resolve(root, "node_modules/typescript/bin/tsc");

rmSync(outDir, { recursive: true, force: true });

try {
  execFileSync(process.execPath, [
    tsc,
    "--target", "ES2022",
    "--module", "NodeNext",
    "--moduleResolution", "NodeNext",
    "--strict",
    "--skipLibCheck",
    "--types", "node",
    "--rootDir", ".",
    "--outDir", outDir,
    "src/lib/ai-runtime/adapters/runtime-config.ts",
    "src/lib/ai-runtime/adapters/planner-client.ts",
    "tests/phase18_ai_runtime_network_config.test.ts",
  ], { cwd: root, stdio: "inherit" });

  execFileSync(process.execPath, [
    "--test",
    resolve(outDir, "tests/phase18_ai_runtime_network_config.test.js"),
  ], { cwd: root, stdio: "inherit" });
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
