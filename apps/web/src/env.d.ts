/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_HOME_LATITUDE?: string
  readonly VITE_HOME_LONGITUDE?: string
  readonly VITE_HOME_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  CESIUM_BASE_URL: string
}
