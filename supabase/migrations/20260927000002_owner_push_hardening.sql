-- Endurece los avisos push tras el linter de seguridad de Supabase.
-- (odd/tasks/owner-push-notifications.md, T2)
--
-- QUÉ SEÑALÓ EL LINTER EN CitelisDev (2026-09-27), sobre 20260927000001:
--   1. `extension_in_public`: pg_net quedó en `public`. Va en `extensions`.
--   2. `anon_security_definer_function_executable`: `revoke ... from public` NO
--      basta en Supabase. Sus privilegios por defecto conceden EXECUTE a `anon`
--      y `authenticated` de forma explícita, y esos grants sobreviven.
--
-- Ninguno era explotable (una función de trigger no se puede llamar por RPC, y
-- save_push_subscription rechaza sin `auth.uid()`), pero la superficie debe ser
-- cero, no "inofensiva por ahora".
--
-- Es una migración aparte, y no una edición de la anterior, porque la anterior
-- ya corrió en CitelisDev: el repositorio tiene que decir lo que se ejecutó.

-- ── pg_net fuera de public ─────────────────────────────────────────────────
-- pg_net no es reubicable: se reinstala. Sus funciones viven siempre en el
-- esquema `net`, así que `notify_new_booking` (que llama a `net.http_post`) no
-- cambia. Solo se pierde la cola pendiente, que en este punto está vacía.
do $$
begin
  if exists (select 1 from pg_extension e
               join pg_namespace n on n.oid = e.extnamespace
              where e.extname = 'pg_net' and n.nspname = 'public') then
    drop extension pg_net;
  end if;
end $$;

create extension if not exists pg_net with schema extensions;

-- ── Nadie llama a estas funciones desde fuera ──────────────────────────────
revoke execute on function notify_new_booking() from anon, authenticated;
revoke execute on function save_push_subscription(bigint, text, text, text) from anon;
