import { defineConfig } from 'nitro'

export default defineConfig({
  serverDir: 'server',
  preset: 'node_server',
  compatibilityDate: '2026-11-12',
  errorHandler: './server/error.ts',
  serverAssets: [
    {
      baseName: 'migrations',
      dir: './migrations',
      pattern: '*.sql',
    },
  ],
})
