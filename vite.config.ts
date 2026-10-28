import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// 每次打包一个版本号：写进程序里，同时单独放一个 version.json。
// 网页打开、切回前台时去取 version.json 比一比，对不上就自动换成新版（见 src/lib/update.ts）。
const BUILD = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
// 给人看的版本号（1.1.0 这种），取 package.json 的 version，显示在「关于」页底部
const VERSION = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;

export default defineConfig({
  // 用相对路径，放到任何网址下都能打开
  base: process.env.ATLAS_BASE || "./",
  define: { __BUILD__: JSON.stringify(BUILD), __VERSION__: JSON.stringify(VERSION) },
  plugins: [
    react(),
    {
      name: "version-json",
      apply: "build",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ v: BUILD }) });
      },
    },
  ],
  server: { port: 5191, strictPort: true, host: true },
  preview: { port: 5191, strictPort: true, host: true },
  build: { chunkSizeWarningLimit: 600 },
});
