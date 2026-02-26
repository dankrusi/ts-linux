import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 6688,
    strictPort: true
  },
  preview: {
    port: 6688,
    strictPort: true
  }
});

