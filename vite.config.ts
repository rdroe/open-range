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

  const rootDir = fileURLToPath(new URL('.', import.meta.url))

  return {
    root: rootDir,
    build: {
      outDir: 'site',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          mockDataDemo: fileURLToPath(new URL('./mock-data-demo.html', import.meta.url)),
          datetimeMockDemo: fileURLToPath(new URL('./datetime-mock-demo.html', import.meta.url)),
          libraryHarness: fileURLToPath(new URL('./library-harness.html', import.meta.url)),
          workerOpenRange: fileURLToPath(
            new URL('./worker-open-range.html', import.meta.url)
          ),
          scrollDemo: fileURLToPath(new URL('./scroll-demo.html', import.meta.url)),
        },
      },
    },
    server: {
      port: 5173,
    },
  }
})
