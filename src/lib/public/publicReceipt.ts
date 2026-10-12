// Acceso a la RPC pública `public_receipt` (P6). Sin sesión: solo habla con la RPC, que
// es la única puerta (la tabla `receipt` no es legible para anon). Un token que no existe
// llega como `null`, y se distingue de una falla de conexión.

import { supabase } from '../supabase/client';
import { LOGO_BUCKET } from '../domain/receiptProfile';
import { isReceiptToken, parsePublicReceipt } from '../domain/publicReceipt';
import type { ReceiptResult } from '../domain/receipt';

export type PublicReceiptLoad = { status: 'found'; result: ReceiptResult } | { status: 'not_found' } | { status: 'error'; message: string };

export async function fetchPublicReceipt(token: string): Promise<PublicReceiptLoad> {
  // Un enlace con forma rara ni siquiera viaja al servidor.
  if (!isReceiptToken(token)) return { status: 'not_found' };
  const { data, error } = await supabase.rpc('public_receipt', { p_token: token });
  if (error) return { status: 'error', message: error.message };
  if (data === null) return { status: 'not_found' };
  const logoUrl = (path: string) => supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
  return { status: 'found', result: parsePublicReceipt(data, logoUrl) };
}
