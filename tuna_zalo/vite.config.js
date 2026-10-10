// vite.config.js
import { defineConfig } from "vite";
import zaloMiniApp from "zmp-vite-plugin";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    zaloMiniApp(), // Kích hoạt plugin Zalo Mini App
  ],
  server: {
    port: 2999,
    fs: {
      strict: false,
      allow: [".."],
    },
  },
  build: {
    outDir: "www", // Xuất kết quả biên dịch ra thư mục 'www' cho ZMP CLI
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
      },
    },
  },
});