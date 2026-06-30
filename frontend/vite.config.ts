/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  envDir: '..',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  server: {
    port: 3001,
    proxy: {
      // Same-origin API proxy during dev: frontend code can call `/api/...`
      // without worrying about CORS, and the Spring Boot backend on :8001 gets
      // the request verbatim.
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: false,
        secure: false,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
