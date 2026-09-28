// Genera el par de claves VAPID de un entorno (CitelisDev o producción) y el
// secreto compartido entre la base y la Edge Function. Ver docs/push-notifications.md.
//
// Uso: node scripts/generate-vapid-keys.mjs <archivo-de-salida>
//   p. ej. node scripts/generate-vapid-keys.mjs ~/citelis-push-dev.json
//
// SEGURIDAD: la clave privada y el secreto se escriben SOLO en el archivo (modo
// 600, fuera del repositorio) y nunca se imprimen: lo que sale por pantalla
// termina en historiales y transcripciones. Por pantalla va solo la clave
// pública, que no es secreta (viaja en el bundle del navegador).
//
// Formato: JWK {publicKey, privateKey}, el que espera `importVapidKeys` de
// @negrel/webpush, más la clave pública en base64url para `applicationServerKey`.

import { webcrypto, randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('Uso: node scripts/generate-vapid-keys.mjs <archivo-de-salida>');
  process.exit(1);
}
const path = resolve(target.replace(/^~(?=\/)/, process.env.HOME ?? '~'));
if (path.startsWith(resolve('.') + '/')) {
  console.error('El archivo debe quedar FUERA del repositorio: lleva la clave privada.');
  process.exit(1);
}
if (existsSync(path)) {
  console.error(`${path} ya existe; no se sobrescribe (rotar claves invalida las suscripciones).`);
  process.exit(1);
}

const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);
const publicKey = await webcrypto.subtle.exportKey('jwk', keys.publicKey);
const privateKey = await webcrypto.subtle.exportKey('jwk', keys.privateKey);
const raw = Buffer.from(await webcrypto.subtle.exportKey('raw', keys.publicKey));
const applicationServerKey = raw.toString('base64url');

writeFileSync(
  path,
  JSON.stringify(
    {
      // Secreto de la Edge Function VAPID_KEYS (el objeto entero, como JSON).
      VAPID_KEYS: { publicKey, privateKey },
      // Variable de Vercel VITE_VAPID_PUBLIC_KEY.
      VITE_VAPID_PUBLIC_KEY: applicationServerKey,
      // Mismo valor en el secreto NOTIFY_SECRET de la función y en Vault
      // (`notify_new_booking_secret`).
      NOTIFY_SECRET: randomBytes(32).toString('hex'),
    },
    null,
    2,
  ) + '\n',
  { mode: 0o600 },
);

console.log(`Claves guardadas en ${path} (modo 600).`);
console.log(`VITE_VAPID_PUBLIC_KEY=${applicationServerKey}`);
