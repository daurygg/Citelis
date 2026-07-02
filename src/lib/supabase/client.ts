// Cliente único de Supabase. Lee las credenciales desde variables de entorno
// (VITE_*). La Publishable key es segura para el navegador: los datos los protege
// la RLS del servidor (INVARIANTE 1 a nivel de base de datos).
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  // No lanzamos aquí para no romper el build; el error se verá al usar el cliente.
  console.error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. ' +
      'Configúralas en Vercel (Project → Settings → Environment Variables).',
  );
}

export const supabase = createClient(url ?? '', publishableKey ?? '');
