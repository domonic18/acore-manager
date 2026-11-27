import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// 版本号来源：环境变量 > 根目录 VERSION 文件 > 默认值
const versionFile = path.resolve(__dirname, '../../VERSION');
const appVersion = process.env.VITE_APP_VERSION
  || (fs.existsSync(versionFile)
    ? fs.readFileSync(versionFile, 'utf-8').trim()
    : '0.1.0');

export default defineConfig({
  plugins: [react()],
  appType: 'spa',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rolldownOptions: {
      output: {
        // 注意：Vite 8 走 rolldown，Rollup 的 manualChunks 语义不适用
        // （默认会把分组成员的依赖一起拖进本块，recharts → react-dom 会让
        //  图表块变成入口块的静态依赖，反而每页都下载；关掉递归包含又会留下
        //  循环 chunk 依赖）。这里只做无依赖外溢的图标合并。
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            // lucide-react 全站 30 个图标合并成 1 块：原先散成 11 个 <500B 的
            // 图标 chunk，11 个请求只换回 4.8KB。合并后每页少 ~10 个请求。
            { name: 'vendor-icons', test: /node_modules[\\/]lucide-react[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        // 本地多实例联调可覆盖：VITE_API_TARGET=http://localhost:9010 npm run dev
        target: process.env.VITE_API_TARGET || 'http://localhost:9000',
        changeOrigin: true,
      },
    },
  },
});
