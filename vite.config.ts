import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/notCAD/",
  plugins: [react()],
  worker: { format: "es" },
  optimizeDeps: { exclude: ["replicad-opencascadejs", "@salusoft89/planegcs"] },
  test: { include: ["tests/**/*.test.ts"] },
} as import("vite").UserConfig);
