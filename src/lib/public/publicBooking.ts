// Capa de datos para el portal público de auto-reserva (Slice C de
// self-booking). Envoltorios delgados sobre las cuatro RPC `SECURITY DEFINER`
// de `supabase/self-booking.sql`. Nunca toca tablas directamente: la
// visitante anónima no tiene sesión, así que todo pasa por estas funciones
// (decisión D2 del documento ODD de self-booking).
//
// Cada función devuelve un resultado discriminado (`ok: true | false`) en vez
// de lanzar o devolver `null`: para quien mira la pantalla, "no hay
// horarios" y "no pudimos conectar" son dos hechos distintos, y esconder el
// error dentro de un estado vacío se lo ocultaría.
import { supabase } from '../supabase/client';

// ── public_business ──────────────────────────────────────────────────────

/** Un servicio reservable, tal como lo proyecta `public_business`. */
export interface PublicBusinessService {
  service_id: number;
  service_name: string;
  price: number; // centavos
  duration_min: number;
}

/** Política de reserva del negocio (misma forma que devuelve la RPC). */
export interface PublicBusinessPolicy {
  slot_step_min: number;
  buffer_min: number;
  min_notice_hours: number;
  max_horizon_days: number;
}

export interface PublicBusinessInfo {
  business_id: number;
  business_name: string;
  services: PublicBusinessService[];
  policy: PublicBusinessPolicy;
  // Color de marca en hex (decisión T5). Opcional: negocios sin color propio
  // todavía no lo traen.
  theme_color?: string;
}

export type PublicBusinessResult =
  | { ok: true; business: PublicBusinessInfo }
  // Cero filas: el slug no existe, el portal está apagado, o el negocio no
  // tiene ningún servicio reservable en línea. `public_business` no
  // distingue estos tres casos (mismo criterio que la propia RPC).
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'connection_error'; message: string };

interface PublicBusinessRow {
  business_id: number;
  business_name: string;
  service_id: number;
  service_name: string;
  price: number;
  duration_min: number;
  slot_step_min: number;
  buffer_min: number;
  min_notice_hours: number;
  max_horizon_days: number;
  theme_color?: string;
}

/** Datos del negocio y sus servicios reservables para el slug público dado. */
export async function fetchPublicBusiness(slug: string): Promise<PublicBusinessResult> {
  const { data, error } = await supabase.rpc('public_business', { p_slug: slug });
  if (error) {
    return { ok: false, reason: 'connection_error', message: error.message };
  }
  const rows = (data ?? []) as PublicBusinessRow[];
  if (rows.length === 0) {
    return { ok: false, reason: 'not_found' };
  }
  const [first] = rows;
  return {
    ok: true,
    business: {
      business_id: first.business_id,
      business_name: first.business_name,
      theme_color: first.theme_color,
      policy: {
        slot_step_min: first.slot_step_min,
        buffer_min: first.buffer_min,
        min_notice_hours: first.min_notice_hours,
        max_horizon_days: first.max_horizon_days,
      },
      services: rows.map((r) => ({
        service_id: r.service_id,
        service_name: r.service_name,
        price: r.price,
        duration_min: r.duration_min,
      })),
    },
  };
}

// ── public_hours ─────────────────────────────────────────────────────────

export interface PublicHoursRow {
  weekday: number;
  opens_at: string;
  closes_at: string;
}

export type PublicHoursResult =
  | { ok: true; hours: PublicHoursRow[] }
  | { ok: false; message: string };

/** Horario semanal de atención del negocio. Un arreglo vacío es válido (sin filas). */
export async function fetchPublicHours(slug: string): Promise<PublicHoursResult> {
  const { data, error } = await supabase.rpc('public_hours', { p_slug: slug });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, hours: (data ?? []) as PublicHoursRow[] };
}

// ── public_busy ──────────────────────────────────────────────────────────

export interface PublicBusyRow {
  starts_at: string; // ISO local 'YYYY-MM-DDTHH:MM'
  duration_min: number;
}

export type PublicBusyResult =
  | { ok: true; busy: PublicBusyRow[] }
  | { ok: false; message: string };

/** Huecos ya ocupados (citas + bloqueos) de un día, anonimizados por la RPC. */
export async function fetchPublicBusy(slug: string, date: string): Promise<PublicBusyResult> {
  const { data, error } = await supabase.rpc('public_busy', { p_slug: slug, p_date: date });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, busy: (data ?? []) as PublicBusyRow[] };
}

// ── public_request_booking ───────────────────────────────────────────────

export interface PublicRequestBookingInput {
  slug: string;
  serviceId: number;
  datetime: string; // ISO local 'YYYY-MM-DDTHH:MM'
  clientName: string;
  clientPhone: string;
}

export type PublicRequestBookingResult =
  | { ok: true; appointmentId: number }
  // La RPC lanza excepción con un mensaje en español ya listo para mostrar
  // (dato faltante, horario recién ocupado, tope de solicitudes por spam…).
  | { ok: false; message: string };

/** Crea la solicitud de cita. Nace REQUESTED, nunca confirmada (decisión D1). */
export async function requestPublicBooking(
  input: PublicRequestBookingInput,
): Promise<PublicRequestBookingResult> {
  const { data, error } = await supabase.rpc('public_request_booking', {
    p_slug: input.slug,
    p_service_id: input.serviceId,
    p_datetime: input.datetime,
    p_client_name: input.clientName,
    p_client_phone: input.clientPhone,
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, appointmentId: data as number };
}
