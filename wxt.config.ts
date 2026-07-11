import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  dev: {
    server: {
      host: "127.0.0.1",
      port: 3000,
      strictPort: true,
    },
  },
  manifest: {
    name: "PDF Compressor",
    description: "Local PDF compressor foundation",
    permissions: ["storage", "offscreen"],
    action: {
      default_title: "PDF Compressor",
      default_popup: "popup.html",
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
  },
});
