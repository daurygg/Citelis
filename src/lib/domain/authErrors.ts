// Traducción de errores de autenticación y de las RPC a lenguaje de la dueña
// (INVARIANTE 4). Supabase devuelve texto en inglés; la UI nunca debe mostrarlo.
//
// REGLA: lo conocido se traduce, lo propio (ya en español, viene de nuestras
// funciones SQL) pasa tal cual, y todo lo demás cae a un mensaje genérico amable.
// Jamás se devuelve el texto crudo desconocido.
//
// Función pura: sin React, sin I/O.

export const GENERIC_AUTH_ERROR = 'Algo no salió como esperábamos. Inténtalo de nuevo en un momento.';

// Reglas en orden: la primera que coincide gana. Se comparan sobre minúsculas.
const RULES: ReadonlyArray<{ test: RegExp; message: string }> = [
  {
    test: /invalid login credentials/,
    message: 'El correo o la contraseña no coinciden. Revísalos e inténtalo otra vez.',
  },
  {
    test: /already registered|already been registered/,
    message: 'Ese correo ya tiene una cuenta. Prueba con iniciar sesión.',
  },
  {
    test: /email not confirmed/,
    message: 'Todavía falta confirmar tu correo. Revisa tu bandeja de entrada y abre el enlace que te enviamos.',
  },
  {
    test: /password.*(at least|too short|weak|characters)|weak password/,
    message: 'La contraseña debe tener al menos 8 caracteres.',
  },
  {
    test: /rate limit|too many|over_.*_rate/,
    message: 'Hiciste varios intentos seguidos. Espera un momento y vuelve a probar.',
  },
  {
    test: /failed to fetch|networkerror|network request failed|load failed/,
    message: 'No pudimos conectarnos. Revisa tu conexión a internet e inténtalo de nuevo.',
  },
];

// Mensajes que ya escriben en español nuestras funciones SQL (create_business,
// redeem_invitation, etc.). Se dejan pasar porque son claros y están pensados
// para la dueña. Se reconocen por prefijo para no filtrar texto ajeno.
const OWN_SPANISH_PREFIXES: readonly string[] = [
  'tu cuenta ya creó un negocio',
  'código inválido',
  'no perteneces',
  'ese negocio no es tuyo',
  'esa dirección ya la usa',
  'este negocio no acepta reservas',
  'tu negocio todavía no tiene',
];

function extractMessage(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && 'message' in raw) {
    const message = (raw as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

/** Convierte cualquier error de auth/RPC en un mensaje en español para la UI. */
export function friendlyAuthError(raw: unknown): string {
  const message = extractMessage(raw).trim();
  if (message === '') return GENERIC_AUTH_ERROR;

  const lower = message.toLowerCase();
  const rule = RULES.find((r) => r.test.test(lower));
  if (rule) return rule.message;

  if (OWN_SPANISH_PREFIXES.some((prefix) => lower.startsWith(prefix))) return message;

  return GENERIC_AUTH_ERROR;
}
