import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => {
  if (mode === 'lib') {
    return {
      build: {
        lib: {
          entry: fileURLToPath(new URL('./src/lib/index.ts', import.meta.url)),
          name: 'OpenRange',
          fileName: 'open-range',
          formats: ['es', 'cjs'],
        },
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
          output: {
            exports: 'named',
          },
        },
      },
    }
  }

  return {
    root: fileURLToPath(new URL('.', import.meta.url)),
    build: {
      outDir: 'site',
      emptyOutDir: true,
    },
    server: {
      port: 5173,
    },
  }
})
