/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_PREFIX?: string;
  readonly VITE_LOCAL_TRUSTED_HEADERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
