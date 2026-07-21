import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BACKGROUND_PATH = "src/entrypoints/background.ts";
const OFFSCREEN_PATH = "src/lib/offscreen/offscreen.ts";

function insertOnce(source, anchor, insertion, label) {
  if (source.includes(insertion.trim())) return source;
  if (!source.includes(anchor)) {
    throw new Error(`Cannot apply ${label}: anchor not found`);
  }
  return source.replace(anchor, `${insertion}${anchor}`);
}

export function patchBackgroundSource(source) {
  let next = source;

  next = insertOnce(
    next,
    'import { tracePdfSplit } from "../lib/pdf-split-trace";\n',
    'import {\n  isBackgroundSmartPlannerPrepareRequest,\n  toOffscreenSmartPlannerPrepareRequest,\n  type BackgroundSmartPlannerPrepareRequest,\n  type SmartPlannerPrepareResponse,\n} from "../lib/ai/smart-planner-runtime-message-contract";\n',
    "background imports",
  );

  next = insertOnce(
    next,
    '  async function handle(message: BackgroundRequest): Promise<BackgroundResponse | null> {\n',
    '  async function prepareSmartPlannerViaOffscreen(\n    message: BackgroundSmartPlannerPrepareRequest,\n  ): Promise<SmartPlannerPrepareResponse> {\n    await ensureOffscreenDocument();\n    return forwardToOffscreen<SmartPlannerPrepareResponse>(\n      toOffscreenSmartPlannerPrepareRequest(message),\n    );\n  }\n\n',
    "background Smart Planner handler",
  );

  const oldListener = `  const backgroundMessageListener = (\n    message: unknown,\n  ) => {\n    if (!isBackgroundRequest(message)) return undefined;\n    return handle(message);\n  };`;
  const newListener = `  const backgroundMessageListener = (\n    message: unknown,\n  ) => {\n    if (isBackgroundSmartPlannerPrepareRequest(message)) {\n      return prepareSmartPlannerViaOffscreen(message);\n    }\n    if (!isBackgroundRequest(message)) return undefined;\n    return handle(message);\n  };`;

  if (!next.includes(newListener)) {
    if (!next.includes(oldListener)) {
      throw new Error("Cannot apply background listener route: anchor not found");
    }
    next = next.replace(oldListener, newListener);
  }

  return next;
}

export function patchOffscreenSource(source) {
  let next = source;

  next = insertOnce(
    next,
    'import { isOffscreenRequest } from "../message-routing";\n',
    'import {\n  isOffscreenSmartPlannerPrepareRequest,\n  type OffscreenSmartPlannerPrepareRequest,\n} from "../ai/smart-planner-runtime-message-contract";\nimport { prepareSmartPlannerRuntimeRequest } from "../ai/smart-planner-runtime-preparation";\n',
    "offscreen imports",
  );

  next = insertOnce(
    next,
    'async function handle(message: OffscreenRequest): Promise<OffscreenResponse | { ok: false; error: string } | null> {\n',
    'async function prepareSmartPlannerFromSelectedPdf(\n  message: OffscreenSmartPlannerPrepareRequest,\n) {\n  return prepareSmartPlannerRuntimeRequest(\n    {\n      requestId: message.requestId,\n      userGoal: message.userGoal,\n      engineCapabilities: message.engineCapabilities,\n      mupdfRuntimeUrl: getMuPdfRuntimeUrl(),\n    },\n    {\n      readSelectedPdf: async () => (await readPdf(SELECTED_PDF_RECORD_ID)).record,\n      profilePdf: (request, isCancelled) => {\n        const input = request.input;\n        return getCompressionWorker().profileContentBlind(\n          transfer(\n            {\n              input,\n              mupdfRuntimeUrl: getMuPdfRuntimeUrl(),\n            },\n            [input],\n          ),\n          proxy(isCancelled),\n        );\n      },\n    },\n  );\n}\n\n',
    "offscreen Smart Planner handler",
  );

  const oldListener = `const offscreenMessageListener = (\n  message: unknown,\n) => {\n  if (!isOffscreenRequest(message)) return undefined;\n\n  return handle(message)\n    .catch((error) => {`;
  const newListener = `const offscreenMessageListener = (\n  message: unknown,\n) => {\n  if (isOffscreenSmartPlannerPrepareRequest(message)) {\n    return prepareSmartPlannerFromSelectedPdf(message)\n      .catch((error) => {\n        logger.error("Captured Smart Planner exception in offscreen", error);\n        return {\n          ok: false as const,\n          error: "CANCELLED" as const,\n          message: error instanceof Error ? error.message : "Smart Planner preparation failed",\n          executionAllowed: false as const,\n          requiresUserConfirmation: true as const,\n        };\n      });\n  }\n  if (!isOffscreenRequest(message)) return undefined;\n\n  return handle(message)\n    .catch((error) => {`;

  if (!next.includes(newListener)) {
    if (!next.includes(oldListener)) {
      throw new Error("Cannot apply offscreen listener route: anchor not found");
    }
    next = next.replace(oldListener, newListener);
  }

  return next;
}

async function applyToRepository(rootDir) {
  const backgroundPath = path.join(rootDir, BACKGROUND_PATH);
  const offscreenPath = path.join(rootDir, OFFSCREEN_PATH);

  const [background, offscreen] = await Promise.all([
    readFile(backgroundPath, "utf8"),
    readFile(offscreenPath, "utf8"),
  ]);

  const patchedBackground = patchBackgroundSource(background);
  const patchedOffscreen = patchOffscreenSource(offscreen);

  await Promise.all([
    writeFile(backgroundPath, patchedBackground),
    writeFile(offscreenPath, patchedOffscreen),
  ]);

  return {
    backgroundChanged: patchedBackground !== background,
    offscreenChanged: patchedOffscreen !== offscreen,
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const currentPath = fileURLToPath(import.meta.url);

if (invokedPath === currentPath) {
  const rootDir = path.resolve(path.dirname(currentPath), "..");
  const result = await applyToRepository(rootDir);
  console.log(JSON.stringify(result));
}
