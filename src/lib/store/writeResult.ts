// Interpretación pura de los errores de escritura que SÍ esperan al servidor.

export interface WriteError {
  message: string;
  code?: string;
}

/**
 * ¿El error dice que la fila ya existe? Pasa cuando un intento anterior llegó a
 * guardarse pero la respuesta se perdió (corte de red tras el commit). Como el
 * formulario reintenta con el MISMO id, la clave primaria lo frena y eso
 * confirma que ya estaba guardado: no es un fallo ni hay que duplicar nada.
 */
export function isAlreadySaved(error: WriteError | null): boolean {
  // Solo la clave primaria de `appointment` lo prueba: un 23505 de otra
  // restricción (las líneas, o un índice futuro) es un fallo de verdad.
  return error?.code === '23505' && error.message.includes('"appointment_pkey"');
}

/**
 * Igual que `isAlreadySaved`, para un pago: el reintento lleva el MISMO id de pago
 * y la llave primaria de `appointment_payment` lo frena, así que no se paga dos veces.
 */
export function isPaymentAlreadySaved(error: WriteError | null): boolean {
  return error?.code === '23505' && error.message.includes('"appointment_payment_pkey"');
}
