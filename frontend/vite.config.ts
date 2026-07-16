/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import {
  resolveBuildProfile,
  validateBuildConfiguration,
} from './src/platform/buildProfile'
import { assertNativeBundlePolicy } from './scripts/check-native-bundle-policy.mjs'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const profile = resolveBuildProfile(mode)
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const backendBaseUrl = mode === 'test' ? '' : validateBuildConfiguration(profile, {
    backendBaseUrl: env.VITE_BACKEND_API_URL,
    browserMapsApiKey: env.VITE_GOOGLE_MAPS_API_KEY,
    appAccessPassword: env.VITE_APP_ACCESS_PASSWORD,
  })
  const source = (path: string) => fileURLToPath(new URL(path, import.meta.url))
  const nativeBundlePolicyPlugin = profile.target === 'native'
    ? {
        name: 'dupert-native-bundle-policy',
        closeBundle() {
          // Scan with the values Vite actually loaded from .env files or CI.
          // The inspector reports only the affected files/variable names, never
          // public configuration values themselves.
          assertNativeBundlePolicy(source('./dist'), {
            VITE_GOOGLE_MAPS_API_KEY: env.VITE_GOOGLE_MAPS_API_KEY,
            VITE_APP_ACCESS_PASSWORD: env.VITE_APP_ACCESS_PASSWORD,
          })
        },
      }
    : undefined

  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      ...(nativeBundlePolicyPlugin ? [nativeBundlePolicyPlugin] : []),
    ],
    define: {
      __DUPERT_BUILD_TARGET__: JSON.stringify(profile.target),
      __DUPERT_DEPLOYMENT_ENVIRONMENT__: JSON.stringify(profile.environment),
      __DUPERT_BACKEND_BASE_URL__: JSON.stringify(backendBaseUrl),
    },
    resolve: {
      alias: {
        '@dupert/platform-integrations': source(`./src/platform/PlatformIntegrations.${profile.target}.tsx`),
        '@dupert/trip-map-surface': source(`./src/components/TripMapSurface.${profile.target}.tsx`),
      },
    },
    build: {
      manifest: true,
    },
    server: {
      port: 3000,
      strictPort: true,
      proxy: {
        // Same-origin API proxy during web development only. Native profiles
        // validate an explicit absolute backend URL at config-load time.
        '/api': {
          target: 'http://localhost:8000',
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
  }
})
