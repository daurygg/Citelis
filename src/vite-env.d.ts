/// <reference types="vite/client" />

// Variables de entorno de la app (se configuran en Vercel y en .env local).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
