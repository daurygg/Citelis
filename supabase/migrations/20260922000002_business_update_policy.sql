-- La dueña puede guardar el color de su negocio (arregla el fallo mudo de G4).
--
-- EL FALLO
--   `business` nacía con una sola policy, `business_select`. Sin policy de
--   UPDATE, RLS no rechaza con error: descarta la escritura y la deja en 0
--   filas. PostgREST devuelve 200 sin `error`, así que `persist()` en
--   StoreContext no tenía nada que registrar. La dueña cambiaba el color, lo
--   veía aplicado por el estado optimista del cliente, y al recargar volvía el
--   viejo. Todas las demás tablas que la app escribe (service, appointment,
--   booking_policy, time_block…) ya tenían policy `ALL`; `business` fue la que
--   se quedó fuera.
--
-- ADITIVO e idempotente: no borra ni una fila. Ver la regresión en
-- supabase/tests/business-theme-update.sql.

-- ── Policy ─────────────────────────────────────────────────────────────────
-- Mismo patrón de DO block que el resto de policies del proyecto: Postgres no
-- soporta `create policy if not exists`, así que se comprueba antes.
--
-- El `with check` no es decorativo: sin él, una fila podría reescribirse
-- apuntando a un negocio del que no eres miembro. `using` filtra lo que puedes
-- tocar; `with check` filtra en qué puede convertirse (INVARIANTE 1).
do $$
begin
  if not exists (
    select 1 from pg_policy
     where polrelid = 'business'::regclass
       and polname  = 'business_update'
  ) then
    create policy business_update on business
      for update
      using (is_member(id))
      with check (is_member(id));
  end if;
end $$;

-- ── Grants por columna ─────────────────────────────────────────────────────
-- RLS decide QUÉ FILAS, nunca qué columnas. Con la policy de arriba y el grant
-- de tabla que Supabase concede por defecto, la dueña podría cambiarse también
-- el `plan`, que es facturación y no es cosa suya. La única herramienta de
-- Postgres para acotar columnas es el grant, así que se retira el de tabla y se
-- concede solo el de la columna que la app necesita escribir.
--
-- OJO al añadir funciones: si mañana se permite renombrar el negocio, hay que
-- meter `name` en este grant. Si no, el fallo será igual de mudo que este.
revoke update on business from anon, authenticated;
grant  update (theme_color) on business to authenticated;
