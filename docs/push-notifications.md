# Avisos push a la dueña

Cuando una clienta pide cita desde el portal, el iPhone de la dueña recibe una
notificación. Esta guía explica cómo encenderlo en un entorno (CitelisDev o
producción) y cómo diagnosticarlo. El porqué de cada decisión está en
`odd/tasks/owner-push-notifications.md`.

## Cómo funciona

```
portal ──► public_request_booking ──► appointment (REQUESTED)
                                          │ trigger appointment_notify_new_booking
                                          ▼
                              net.http_post (pg_net, asíncrono)
                                          │ x-notify-secret
                                          ▼
                         Edge Function notify-new-booking
                                          │ VAPID (@negrel/webpush)
                                          ▼
                     servicio de push de Apple ──► iPhone de la dueña
```

- **Una reserva nunca falla por el aviso.** `pg_net` solo encola. Si falta la
  configuración de Vault, el trigger no hace nada, y cualquier error queda como
  WARNING.
- En el iPhone solo funciona con **Citelis añadido a la pantalla de inicio**
  (iOS 16.4 o superior). Desde Safari sin instalar, el botón explica cómo
  instalar.

## Encenderlo en un entorno

Hay que hacerlo una vez por entorno, **en este orden**. Si Vault apunta a una
función que todavía no existe, las reservas siguen funcionando, pero los
avisos fallan en silencio.

### 1 · Generar las claves

```bash
node scripts/generate-vapid-keys.mjs ~/citelis-push-dev.json    # o ~/citelis-push-prod.json
```

El archivo queda con modo 600 y **fuera del repositorio**. La clave privada no
se imprime nunca. Guárdalo: si se rotan las claves, todas las suscripciones
dejan de servir y cada dueña tiene que volver a activar el aviso.

### 2 · Secretos de la Edge Function

Supabase → proyecto → **Edge Functions → Secrets**:

| Secreto | Valor |
|---|---|
| `NOTIFY_SECRET` | `NOTIFY_SECRET` del archivo |
| `VAPID_KEYS` | el objeto `VAPID_KEYS` del archivo, como JSON en una línea |
| `VAPID_SUBJECT` | `mailto:` + un correo de contacto del negocio |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los pone Supabase.

### 3 · Desplegar la función

Se despliega con la **verificación de JWT apagada**, porque quien la llama es
la base de datos y no una persona con sesión. La protege `x-notify-secret`.

```bash
supabase functions deploy notify-new-booking --no-verify-jwt --project-ref <ref>
```

Otra opción es el MCP `supabase-write` (`deploy_edge_function` con
`verify_jwt: false`), subiendo `index.ts` y los archivos de `_shared/` que
importa.

### 4 · Vault

En el editor SQL del proyecto. Pega el secreto aquí, **no en un chat**:

```sql
select vault.create_secret(
  'https://<ref>.supabase.co/functions/v1/notify-new-booking',
  'notify_new_booking_url'
);
select vault.create_secret('<NOTIFY_SECRET del archivo>', 'notify_new_booking_secret');
```

### 5 · Clave pública en Vercel

`VITE_VAPID_PUBLIC_KEY` = `VITE_VAPID_PUBLIC_KEY` del archivo. No es secreta.

- CitelisDev: entorno **Preview**, limitado a la rama, igual que las otras
  variables de CitelisDev.
- Producción: entorno **Production**.

Vite la incrusta al compilar, así que después hay que **volver a desplegar**.
Sin ella, "Mi negocio" dice que los avisos aún no están listos.

### 6 · Probar en el iPhone de la dueña

1. Abrir Citelis en Safari → Compartir → "Añadir a pantalla de inicio".
2. Abrir Citelis **desde el ícono**, entrar a "Mi negocio" y tocar "Avisarme de
   nuevas reservas". Luego aceptar el permiso.
3. Desde otro teléfono, pedir una cita en el portal público del negocio.
4. Tiene que llegar "Nueva solicitud de cita". Al tocarla, se abre la bandeja de
   reservas.

## Diagnóstico

- **¿El trigger llamó?** Las respuestas de `pg_net` quedan unas horas en:

  ```sql
  select id, status_code, content::text, error_msg, created
    from net._http_response order by created desc limit 10;
  ```

  | Respuesta | Qué significa |
  |---|---|
  | 401 | `NOTIFY_SECRET` no coincide con Vault |
  | 404 | la función no está desplegada o la URL de Vault está mal |
  | 500 `Push no configurado` | faltan `VAPID_KEYS` o `VAPID_SUBJECT`, o están mal |
  | 200 `{"sent":0}` | la dueña no tiene dispositivos suscritos |

- **¿Qué pasó dentro de la función?** Supabase → Edge Functions →
  `notify-new-booking` → Logs.
- **Suscripciones:** `select business_id, user_id, created_at from push_subscription;`.
  Las que el servicio de push da por muertas (404/410) se borran solas.
- **Test de regresión:** `supabase/tests/owner-push-notifications.sql`. Se pega
  entero en el editor SQL y tiene que responder VERDE.
