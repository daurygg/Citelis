/// <reference types="vite/client" />

// Variables de entorno de la app (se configuran en Vercel y en .env local).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  // Clave pública VAPID de los avisos push (T5, odd/tasks/owner-push-notifications.md).
  // Vacía en local mientras no se despliegue (T6): el botón lo explica en vez de fallar.
  readonly VITE_VAPID_PUBLIC_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
