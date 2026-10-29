import { defineConfig } from "vite";
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { output: { manualChunks: { pdfjs: ["pdfjs-dist"] } } },
  },
  server: { proxy: { "/api": "http://127.0.0.1:8090" } },
});
