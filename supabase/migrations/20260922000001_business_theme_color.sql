-- Color de marca por negocio (G2 de odd/tasks/business-theming.md).
--
-- ADITIVO e idempotente: correrla contra una base con datos no borra ni una
-- fila. El color vive en `business.theme_color`, ya aislada por tenant
-- (INVARIANTE 1): cada fila de `business` sigue siendo del negocio dueño.
--
-- G1 (src/lib/domain/theme.ts, ya cerrado) deriva toda la rampa de marca a
-- partir de un solo hex. Aquí solo se guarda y se sirve ese hex; la
-- matemática de color no vive en SQL.

-- ── Columna ─────────────────────────────────────────────────────────────────
-- Rosa actual como default: las filas existentes no cambian de aspecto al
-- migrar. `not null` porque la UI (G3/G4) siempre necesita un color con el
-- que pintar, nunca un hueco que forzarla a adivinar.
alter table business
  add column if not exists theme_color text not null default '#e11d48';

-- Postgres no soporta `add constraint if not exists`, así que se guarda con
-- el mismo patrón de DO block que usan las policies de RLS en este proyecto:
-- comprobar antes de crear, para que re-correr la migración no falle.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'business'::regclass
       and conname = 'business_theme_color_format'
  ) then
    alter table business
      add constraint business_theme_color_format
      check (theme_color ~ '^#[0-9a-fA-F]{6}$');
  end if;
end $$;

-- ── create_business: la trampa del argumento nuevo ─────────────────────────
-- No basta con añadir un parámetro con default a la función existente:
-- `create_business(text)` y `create_business(text, text default null)`
-- convivirían, y una llamada con un solo argumento (la que hace hoy
-- Onboarding.tsx) queda AMBIGUA entre las dos sobrecargas y falla en
-- runtime. Hay que tirar la versión vieja primero. Los grants no
-- sobreviven al drop, así que se re-conceden después.
drop function if exists create_business(text);

create or replace function create_business(p_name text, p_theme_color text default null)
returns bigint language plpgsql security definer
set search_path = public, pg_temp as $$
declare new_id bigint;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  new_id := nextval('business_id_seq');
  insert into business (id, name, plan) values (new_id, p_name, 'mvp');
  -- El color es cosmético: un hex ausente o mal formado NUNCA debe tumbar el
  -- alta del negocio. Si no matchea, la fila se queda con el default de la
  -- columna (ya insertado arriba) en vez de recibir un valor a medias.
  if p_theme_color ~ '^#[0-9a-fA-F]{6}$' then
    update business set theme_color = p_theme_color where id = new_id;
  end if;
  insert into business_member (user_id, business_id) values (auth.uid(), new_id);
  return new_id;
end; $$;

-- Por default de esquema este proyecto concede EXECUTE a anon Y a
-- authenticated en cuanto la función nace (ver 20260918000004). create_business
-- exige `auth.uid()`, así que dejarlo así rompería el mismo patrón que se
-- corrigió ahí: hay que revocar de anon por nombre, no de PUBLIC.
revoke execute on function create_business(text, text) from public;
revoke execute on function create_business(text, text) from anon;
grant  execute on function create_business(text, text) to authenticated;

-- ── public_business: mismo drop, otra razón ────────────────────────────────
-- Esta vez el obstáculo no es la sobrecarga: es que Postgres no deja
-- `create or replace` cambiar la lista de columnas de un `returns table`.
-- Hay que tirarla y recrearla con la columna nueva.
--
-- Proyección EXPLÍCITA, columna por columna, igual que en 20260918000002:
-- `service` carga `supply_cost` y `cost_override` (los costos de la dueña) y
-- jamás pueden llegar a una función pública. Nada de `select *`.
drop function if exists public_business(text);

create or replace function public_business(p_slug text)
returns table (
  business_id      bigint,
  business_name    text,
  theme_color      text,
  service_id       bigint,
  service_name     text,
  price            bigint,
  duration_min     integer,
  slot_step_min    integer,
  buffer_min       integer,
  min_notice_hours integer,
  max_horizon_days integer
) language sql security definer stable
set search_path = public, pg_temp as $$
  select b.id, b.name, b.theme_color, s.id, s.name, s.price, s.duration_min,
         p.slot_step_min, p.buffer_min, p.min_notice_hours, p.max_horizon_days
    from booking_policy p
    join business b on b.id = p.business_id
    join service  s on s.business_id = p.business_id
   where p.public_slug = p_slug
     and p.enabled
     and s.variable_price = false
     and s.duration_min > 0
   order by s.name;
$$;

revoke execute on function public_business(text) from public;
grant  execute on function public_business(text) to anon, authenticated;
