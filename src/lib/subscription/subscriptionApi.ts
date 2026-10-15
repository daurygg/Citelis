// Capa de datos de las suscripciones (S5/S6): las únicas llamadas a RPC de esta
// función. Los componentes no hablan con Supabase; reciben el resultado ya mapeado
// por el dominio puro.
import { supabase } from '../supabase/client';
import { parseAdminBusinesses } from '../domain/subscriptionAdmin';
import type { PaymentArgs } from '../domain/subscriptionAdmin';
import { parseMySubscription } from '../domain/subscriptionView';
import type { AdminBusiness, SubscriptionState } from '../domain/types';

export type ApiResult = { ok: true } | { ok: false; message: string };

/**
 * Estado de la suscripción de la dueña. FALLA ABIERTO: si la RPC falla o no se entiende
 * devuelve null (la app no se bloquea) y deja el error en consola. Es seguro porque el
 * bloqueo real lo hace el servidor (`is_member` + RLS); esto solo decide qué se muestra.
 */
export async function fetchMySubscription(): Promise<SubscriptionState | null> {
  try {
    const { data, error } = await supabase.rpc('my_subscription');
    if (error) {
      console.error('my_subscription falló; no se bloquea la app:', error.message);
      return null;
    }
    return parseMySubscription(data);
  } catch (e) {
    console.error('my_subscription falló; no se bloquea la app:', e);
    return null;
  }
}

/** ¿Es administradora de la plataforma? Ante cualquier fallo: no (el panel queda oculto). */
export async function fetchIsPlatformAdmin(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_platform_admin');
    if (error) {
      console.error('is_platform_admin falló; se oculta el panel:', error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error('is_platform_admin falló; se oculta el panel:', e);
    return false;
  }
}

export type AdminBusinessesResult = { ok: true; businesses: AdminBusiness[] } | { ok: false; message: string };

export async function fetchAdminBusinesses(): Promise<AdminBusinessesResult> {
  const { data, error } = await supabase.rpc('admin_list_businesses');
  if (error) return { ok: false, message: error.message };
  try {
    return { ok: true, businesses: parseAdminBusinesses(data) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Respuesta inesperada del servidor.' };
  }
}

/** Registra el pago. El mensaje de error es el del servidor, tal cual. */
export async function registerSubscriptionPayment(businessId: number, args: PaymentArgs): Promise<ApiResult> {
  const { error } = await supabase.rpc('admin_register_payment', {
    p_business_id: businessId,
    p_amount_cents: args.amount_cents,
    p_paid_until: args.paid_until,
    p_method: args.method,
    p_note: args.note,
  });
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function setBusinessExempt(businessId: number, exempt: boolean): Promise<ApiResult> {
  const { error } = await supabase.rpc('admin_set_exempt', { p_business_id: businessId, p_exempt: exempt });
  return error ? { ok: false, message: error.message } : { ok: true };
}
