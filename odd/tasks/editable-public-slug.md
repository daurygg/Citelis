# La dueña puede cambiar su dirección sin romper los enlaces repartidos

## Objetivo

Que la dueña edite `citelis.app/reservar/<lo-que-sea>` desde "Mi negocio", y que
las clientas que guardaron la dirección anterior sigan llegando.

## Problema

El slug se deriva del nombre al crear el negocio y después nadie puede tocarlo.
Si se equivocó tecleando, o cambia de nombre comercial, se queda así. Hoy la
única salida es un `update` a mano en la base — que es exactamente lo que hubo
que hacer con GGAUR4 (`negocio-1001` → `ggaur4`, 2026-09-23), rompiendo de paso
el enlace anterior.

## Decisión

Editable, y el enlace viejo sigue vivo (usuario, 2026-09-23). Se descartó
avisar-y-romper: ese daño es invisible, nadie le escribe a la dueña para decirle
que su enlace ya no sirve.

## Diseño

Las direcciones abandonadas se guardan y redirigen.

**Sin tocar las cuatro RPC públicas.** La alternativa era resolver el alias
dentro de cada una, pero eso obligaba a reescribir `public_request_booking`, que
son 100 líneas de validaciones con su regresión H1–H6. En vez de eso, la
redirección vive en el portal: si el slug no existe, se pregunta por el actual y
se cambia la URL. Un viaje extra solo en el caso raro, y la barra de direcciones
queda corregida, así que el enlace guardado se cura solo.

Piezas:
- `booking_slug_history(slug, business_id, replaced_at)` — las direcciones que
  se abandonaron. Un slug pertenece a un negocio para siempre, aunque lo suelte:
  si no, otro negocio podría quedarse con el tráfico del primero.
- `resolve_public_slug(slug)` — dado un slug viejo, devuelve el actual. Público.
- `set_public_slug(slug)` — el cambio, para la dueña. Valida formato, comprueba
  que no la tenga otro negocio (ni ahora ni antes), archiva la anterior.
- Grant por columna: `public_slug` deja de ser escribible directamente, para que
  el cambio pase sí o sí por la función y el historial no se quede cojo.

## Modo TDD

Estricto. `npm run test:run` para lo puro; la regresión SQL es manual.

## Tareas

- [x] **T1 · Migración**: tabla, las dos funciones y el grant por columna.
- [x] **T2 · Regresión SQL** `supabase/tests/public-slug-change.sql`.
- [x] **T3 · UI + store**: editor de la dirección en "Mi negocio".
- [x] **T4 · Redirección** del enlace viejo en el portal público.

## Criterios de aceptación

1. Cambiar la dirección funciona y la nueva responde.
2. La dirección anterior sigue llevando al negocio, y la URL se corrige sola.
3. Otro negocio no puede tomar una dirección ya usada, ni actual ni abandonada.
4. Una dirección con mayúsculas, acentos o espacios se rechaza con un mensaje
   que la dueña entienda.
5. Volver a una dirección propia antigua la reactiva.
6. `public_slug` no se puede escribir saltándose la función.

## Progreso

- 2026-09-23 · T1 y T2 cerradas contra CitelisDev. ROJO observado
  (`function set_public_slug(unknown) does not exist`), VERDE con 6 aserciones.
- 2026-09-23 · La regresión cazó un fallo de diseño propio: la primera versión de
  `set_public_slug` deducía el negocio con `limit 1` sobre `business_member` y,
  con una dueña en más de un negocio, cambiaba la dirección del equivocado
  devolviendo el slug nuevo como si hubiera funcionado. Corregido pasando el
  negocio explícito y comprobando `is_member` (INVARIANTE 1). La aserción 1
  ahora verifica también que el OTRO negocio no se tocó.
- NOTA de despliegue: en CitelisDev la corrección se aplicó como DDL suelto
  después de la migración, así que la versión registrada allí y el archivo no
  coinciden literalmente, aunque el esquema resultante sí. Una base nueva desde
  el archivo queda correcta de una sola pasada.
- 2026-09-23 · T3 y T4 cerradas.
  - T3: `src/components/owner/PublicLinkSettings.tsx` (nuevo), montado junto a
    `BrandSettings` en "Mi negocio" (`src/App.tsx`). `store.updatePublicSlug`
    (`src/lib/store/StoreContext.tsx`) rompe a propósito el patrón
    fire-and-forget de `persist()`: espera la respuesta de `set_public_slug`
    y solo toca el estado local si el servidor la acepta, para no mostrarle a
    la dueña una dirección que nunca llegó a ser suya.
  - T4: `resolvePublicSlug` en `src/lib/public/publicBooking.ts` envuelve
    `resolve_public_slug`. `src/components/public/PublicBooking.tsx` ahora
    trabaja sobre un `activeSlug` propio (no directamente sobre el prop
    `slug`): si `public_business` responde `not_found`, se pregunta una vez
    (con un `useRef`, no reintenta) si es una dirección abandonada; si hay
    dirección actual, se corrige la URL con `history.replaceState` y se
    recarga todo (negocio, horario, disponibilidad, la propia solicitud de
    reserva) contra esa dirección nueva — las cuatro RPC públicas no conocen
    el historial de slugs, así que sin este cambio de `activeSlug` las
    llamadas siguientes habrían seguido fallando contra la dirección vieja.
  - Verificación: `npm run typecheck`, `npm run test:run` (178/178, sin
    cambios — ninguna de las piezas nuevas es lógica pura, y el proyecto no
    tiene React Testing Library ni tests de componentes) y `npm run build`,
    los tres en verde.
- Producción sigue sin ninguna migración de estos dos días.
