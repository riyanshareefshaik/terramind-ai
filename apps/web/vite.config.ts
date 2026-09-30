import { createRequire } from 'node:module'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, normalizePath } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// Cesium ships prebuilt web workers, widget CSS and runtime assets that must be
// served as static files. They are copied to /cesium and located at runtime via
// CESIUM_BASE_URL (see src/cesium/setup.ts). Resolving the package keeps this
// working whether npm hoists cesium to the workspace root or not.
const require = createRequire(import.meta.url)
const cesiumBuild = normalizePath(
  path.join(path.dirname(require.resolve('cesium/package.json')), 'Build/Cesium'),
)
// The copy plugin keeps each file's path relative to the Vite root (ignoring
// '..'), so strip everything up to Build/Cesium to land files in /cesium/*.
const cesiumBuildDepth = normalizePath(path.relative(process.cwd(), cesiumBuild))
  .split('/')
  .filter((segment) => segment !== '..').length

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8000'

  return {
    plugins: [
      react(),
      viteStaticCopy({
        targets: ['Workers', 'ThirdParty', 'Assets', 'Widgets'].map((dir) => ({
          src: `${cesiumBuild}/${dir}`,
          dest: 'cesium',
          rename: { stripBase: cesiumBuildDepth },
        })),
      }),
    ],
    server: {
      // Same-origin proxy so the browser never needs CORS in development.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/health': { target: apiTarget, changeOrigin: true },
      },
    },
    preview: {
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/health': { target: apiTarget, changeOrigin: true },
      },
    },
    build: {
      // CesiumJS is a single multi-megabyte module; it is lazy-loaded into its
      // own chunk, so the default 500 kB warning is expected noise.
      chunkSizeWarningLimit: 6000,
    },
  }
})
