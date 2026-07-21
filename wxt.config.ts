import { defineConfig } from "wxt";

const AI_LAB_MODE = "ai-lab";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  popup: {
    title: "__MSG_extensionTitle__",
  },
  hooks: {
    "build:manifestGenerated": (wxt: any, manifest: any) => {
      const isAiLab = wxt.config.mode === AI_LAB_MODE;

      manifest.action ??= {};
      manifest.action.default_title = isAiLab
        ? "PDF Compressor AI Lab"
        : "__MSG_extensionTitle__";

      if (isAiLab) {
        manifest.name = "PDF Compressor AI Lab";
        manifest.short_name = "PDF AI Lab";
        manifest.description =
          "Experimental privacy-first AI orchestration build for PDF processing.";
      }
    },
  },
  manifest: {
    name: "__MSG_extensionName__",
    description: "__MSG_extensionDescription__",
    default_locale: "en",
    version: "0.1.0",
    permissions: ["storage", "offscreen", "alarms", "system.cpu", "system.memory"],
    optional_host_permissions: ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"],
    action: {
      default_popup: "popup.html",
    },
    background: {
      service_worker: "background.js",
      type: "module",
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self';",
    },
  },
} as any);
