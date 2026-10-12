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

## Estado por entorno

| Entorno | Proyecto | Encendido | Probado en el iPhone |
|---|---|---|---|
| CitelisDev | `mpmbrntyojomfhrdcurt` | 2026-09-27 (MCP) | ✅ `200 {"sent":1}` |
| Producción | `fpgzdhfrverxjtwytqxv` | 2026-09-27 (CLI) | ✅ aviso y bandeja en vivo |

## Encenderlo en un entorno

Hay que hacerlo una vez por entorno, **en este orden**. Si Vault apunta a una
función que todavía no existe, las reservas siguen funcionando, pero los
avisos fallan en silencio.

La CLI está en el proyecto como dependencia de desarrollo, así que se llama con
`npx supabase ...`. `supabase start` **no hace falta**: levanta una base local
con Docker, y para esto se trabaja contra el proyecto remoto.

### 0 · Migraciones

`20260927000001`, `20260927000002` y `20260928000001` (esta última es la de las
reservas en vivo, ver `odd/tasks/live-appointments.md`).

```bash
unset SUPABASE_ACCESS_TOKEN   # si hay un token viejo de otra cuenta en el entorno
npx supabase login            # con la cuenta DUEÑA del proyecto
npx supabase link --project-ref <ref>
npx supabase migration list
```

⚠️ **Si la columna Remote sale vacía, NO hagas `db push` todavía.** Así estaba
producción, porque las primeras migraciones se aplicaron a mano en el editor SQL
y nunca quedaron registradas. `db push` volvería a ejecutarlas todas. Primero:

1. Comprueba con una consulta de solo lectura que existen los objetos de la
   última migración ya aplicada.
2. Márcalas como aplicadas: `npx supabase migration repair --status applied <versiones...>`.
3. Ensaya con `npx supabase db push --dry-run`, que tiene que listar solo las
   pendientes, y después ejecuta `npx supabase db push`.

No corras `supabase/tests/owner-push-notifications.sql` en producción: crea y
borra negocios de prueba. `supabase/tests/live-appointments.sql` solo lee.

### 1 · Generar las claves

```bash
node scripts/generate-vapid-keys.mjs ~/citelis-push-dev.json    # o ~/citelis-push-prod.json
```

El archivo queda con modo 600 y **fuera del repositorio**. La clave privada no
se imprime nunca. Guárdalo: si se rotan las claves, todas las suscripciones
dejan de servir y cada dueña tiene que volver a activar el aviso.

### 2 · Secretos de la Edge Function

Por CLI, sin archivo `.env` y sin que los valores aparezcan en pantalla ni en el
historial. Así se hizo en producción:

```bash
npx supabase secrets set --project-ref <ref> \
  NOTIFY_SECRET="$(jq -r .NOTIFY_SECRET ~/citelis-push-<env>.json)" \
  VAPID_KEYS="$(jq -c .VAPID_KEYS ~/citelis-push-<env>.json)" \
  VAPID_SUBJECT="mailto:<correo de contacto>"
npx supabase secrets list --project-ref <ref>   # nombres y hashes, no valores
```

O a mano en Supabase → proyecto → **Edge Functions → Secrets**:

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
npx supabase functions deploy notify-new-booking --no-verify-jwt --use-api --project-ref <ref>
```

`--use-api` empaqueta en los servidores de Supabase, **sin Docker**. La CLI sube
por su cuenta los `_shared/` que importa `index.ts`.

Para comprobarlo, llama con un secreto incorrecto. Tiene que responder **401**:
eso confirma que arrancó y que `NOTIFY_SECRET` está cargado.

```bash
curl -s -w ' HTTP %{http_code}\n' -X POST https://<ref>.supabase.co/functions/v1/notify-new-booking \
  -H 'Content-Type: application/json' -H 'x-notify-secret: incorrecto' -d '{"appointment_id":1}'
```

Otra opción es el MCP `supabase-write` (`deploy_edge_function` con
`verify_jwt: false`). Así se desplegó en CitelisDev el 2026-09-27: los archivos
se suben con su carpeta (`notify-new-booking/index.ts`,
`_shared/notifyNewBooking.ts`, `_shared/notifyWiring.ts`,
`_shared/newBookingMessage.ts`) y `entrypoint_path` =
`notify-new-booking/index.ts`, para que resuelvan los `../_shared/`. Los tests
(`*.test.ts`) no se suben.

Sin secretos, la función responde 500 y en los logs aparece
`Falta el secreto NOTIFY_SECRET`. Eso confirma que arrancó bien.

### 4 · Vault

En el editor SQL del proyecto. Pega el secreto aquí, **no en un chat**:

```sql
select vault.create_secret(
  'https://<ref>.supabase.co/functions/v1/notify-new-booking',
  'notify_new_booking_url'
);
select vault.create_secret('<NOTIFY_SECRET del archivo>', 'notify_new_booking_secret');
```

Para comprobar que la base llega a la función con ese secreto, sin tocar
ninguna cita, se llama con una cita que no existe:

```sql
select net.http_post(
  url     := (select decrypted_secret from vault.decrypted_secrets where name = 'notify_new_booking_url'),
  body    := jsonb_build_object('appointment_id', -1),
  headers := jsonb_build_object('Content-Type', 'application/json',
             'x-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_new_booking_secret'))
);
-- unos segundos después:
select status_code, content::text from net._http_response order by created desc limit 1;
```

Tiene que responder `200 {"sent":0,"skipped":"not_requested"}`. Un 401 significa
que el secreto de Vault no coincide con el de la función.

### 5 · Clave pública en Vercel

`VITE_VAPID_PUBLIC_KEY` = `VITE_VAPID_PUBLIC_KEY` del archivo. No es secreta.

- CitelisDev: entorno **Preview**, limitado a la rama, igual que las otras
  variables de CitelisDev.
- Producción: entorno **Production**.

Vite la incrusta al compilar, así que después hay que **volver a desplegar**.
Sin ella, "Mi negocio" dice que los avisos aún no están listos.

⚠️ Los previews de ramas que no son `develop` usan las variables genéricas de
Preview, que apuntan a la base de **producción**. Para probar contra CitelisDev,
usa el preview de `develop`.

Producción se despliega desde `main`: el frontend llega ahí por el PR de
release `develop` → `main`.

### 6 · Probar en el iPhone de la dueña

Cada entorno tiene sus propias claves. La suscripción de un entorno **no sirve
en el otro**: al pasar a producción, la dueña tiene que volver a activar el aviso.

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
