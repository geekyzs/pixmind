import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'shared')
    }
  },
  plugins: [
    vue(),
    electron([
      {
        // 主进程入口
        entry: 'electron/main.ts',
        onstart(args) {
          args.startup()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              // 这些原生模块不打包，运行时从 node_modules 加载
              external: ['better-sqlite3', 'sharp', 'onnxruntime-node', 'chokidar']
            }
          }
        }
      },
      {
        // preload 脚本
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      },
      {
        // Embedding Worker 线程脚本（由 new Worker() 动态加载，需单独编译产出）
        entry: 'electron/embedding/embedWorker.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['better-sqlite3', 'sharp', 'onnxruntime-node', 'chokidar']
            }
          }
        }
      }
    ]),
    renderer()
  ],
  server: {
    port: 5173
  }
})
