-- Regresión: las citas llegan en vivo a la app de la dueña.
-- Ver odd/tasks/live-appointments.md (T1).
--
-- CÓMO CORRERLO
--   Editor SQL de Supabase, MCP (`execute_sql`) o psql. Pégalo entero.
--   NO corre en CI: el workflow solo ejecuta vitest, sin base de datos.
--   No escribe nada: solo lee el catálogo.

do $$
begin
  -- 1 · Sin esto, Realtime no emite ni un solo evento de `appointment`.
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointment') then
    raise exception 'FALLÓ 1: appointment no está en la publicación supabase_realtime';
  end if;

  -- 2 · La publicación tiene que emitir altas y cambios (reserva nueva, aceptar,
  --     rechazar, completar). Si alguien la recreara con otro `publish`, se
  --     callaría sin avisar.
  if not exists (select 1 from pg_publication
                  where pubname = 'supabase_realtime' and pubinsert and pubupdate) then
    raise exception 'FALLÓ 2: supabase_realtime no publica INSERT y UPDATE';
  end if;

  -- 3 · La RLS es lo que impide que llegue una cita de otro negocio: Realtime
  --     solo entrega las filas que la dueña podría leer con SELECT.
  if not (select relrowsecurity from pg_class where oid = 'public.appointment'::regclass) then
    raise exception 'FALLÓ 3: appointment sin RLS; Realtime entregaría citas de otros negocios';
  end if;
end $$;

select 'VERDE: las 3 aserciones pasaron' as resultado;
