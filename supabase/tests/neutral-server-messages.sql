-- Regresión de odd/tasks/owner-profile.md (S7): los mensajes que el servidor le
-- muestra a quien administra no asumen género (invariante 4).
-- Ver supabase/migrations/20261105000002_neutral_server_messages.sql
--
-- CÓMO CORRERLO: pégalo entero DESPUÉS de la migración (psql, editor SQL o CI).
-- PARA VER EL ROJO: córrelo ANTES; falla en la aserción 1 (siguen los textos viejos).
--
-- QUÉ PRUEBA
--   1 · Ninguna versión vigente de schedule_appointment ni complete_appointment
--       contiene los mensajes en femenino, y sí los nuevos.
--   (El mensaje de complete_appointment con una persona de otro negocio o dada de
--    baja se prueba de punta a punta en employees.sql.)

do $$
declare
  v_def text;
begin
  select string_agg(pg_get_functiondef(p.oid), E'\n') into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('schedule_appointment', 'complete_appointment');

  if v_def is null then raise exception 'FALLÓ 0: no se encontraron las funciones'; end if;

  if v_def ~ 'de la clienta\.|Esa clienta|Una empleada' then
    raise exception 'FALLÓ 1: quedan mensajes en femenino en schedule_appointment/complete_appointment';
  end if;
  if position('Falta el nombre del cliente.' in v_def) = 0
     or position('Ese cliente no pertenece a tu negocio.' in v_def) = 0
     or position('Esa persona no pertenece a tu equipo.' in v_def) = 0
     or position('Esa persona ya no está en tu equipo y no se puede asignar.' in v_def) = 0 then
    raise exception 'FALLÓ 1: falta alguno de los mensajes nuevos';
  end if;
end $$;

select 'VERDE: los mensajes del servidor no asumen género' as resultado;
