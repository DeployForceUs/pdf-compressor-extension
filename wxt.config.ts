import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  popup: {
    title: "__MSG_extensionTitle__",
  },
  hooks: {
    "build:manifestGenerated": (_wxt: any, manifest: any) => {
      manifest.action ??= {};
      manifest.action.default_title = "__MSG_extensionTitle__";
    },
  },
    manifest: {
    name: "__MSG_extensionName__",
    description: "__MSG_extensionDescription__",
    default_locale: "en",
    version: "0.1.0",
    permissions: ["storage", "offscreen", "alarms"],
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
