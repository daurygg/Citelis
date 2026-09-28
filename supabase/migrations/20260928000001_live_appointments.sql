-- Las citas llegan en vivo a la app de la dueña (Supabase Realtime).
-- (odd/tasks/live-appointments.md, T1)
--
-- EL PROBLEMA
--   La app carga las citas una vez al abrir. Llega el aviso push de una reserva
--   nueva, la dueña abre Citelis y la bandeja sigue vacía hasta que recarga.
--
-- LA DECISIÓN
--   Realtime (`postgres_changes`) empuja cada alta o cambio de `appointment`
--   por WebSocket. Para eso la tabla tiene que estar en la publicación
--   `supabase_realtime`.
--
-- POR QUÉ NO SE RECREA LA PUBLICACIÓN
--   La guía de Supabase la borra y la crea de nuevo. Aquí NO: se perderían las
--   tablas que otro cambio haya añadido. Solo se añade esta, y solo si falta.
--
-- AISLAMIENTO (INVARIANTE 1)
--   Realtime solo entrega los INSERT/UPDATE que la dueña podría leer con SELECT,
--   así que la RLS de `appointment` (is_member) sigue mandando. Los DELETE no
--   pasan por RLS: la app no los escucha, y las citas nunca se borran.
--
-- ADITIVO: no toca ni una fila.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointment') then
    alter publication supabase_realtime add table public.appointment;
  end if;
end $$;
