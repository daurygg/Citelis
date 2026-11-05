-- Módulos opcionales por negocio (odd/tasks/business-modules.md): Tienda (`store`,
-- el modo Ropa: productos y ventas) y Equipo (`team`: personas del equipo y quién
-- atendió cada servicio). Solo el administrador de la plataforma los cambia
-- (`admin_set_module`). Apagado, el módulo desaparece de la app y el servidor
-- rechaza escribir en él; sus datos se conservan y vuelven al activarlo.
--
-- POR DEFECTO (S4)
--   Los negocios que ya existen conservan los dos módulos (la columna nace en true
--   para todas las filas actuales). Los negocios nuevos empiezan sin ninguno (el
--   default pasa a false después del relleno).
--
-- QUIÉN LOS CAMBIA (S6)
--   El dueño o la dueña solo puede actualizar las columnas de `business` que tienen
--   `grant update` explícito (theme_color, address, phone, logo_path). Estas dos no
--   lo tienen, así que solo cambian vía `admin_set_module` (security definer).
--
-- POR QUÉ NO SE TOCA `is_member`
--   La comparten ~21 políticas. Cada tabla del módulo recibe su propia condición.

-- ── Columnas ────────────────────────────────────────────────────────────────
alter table business add column store_enabled boolean not null default true;
alter table business add column team_enabled  boolean not null default true;
alter table business alter column store_enabled set default false;
alter table business alter column team_enabled  set default false;

-- ── ¿Está activo? ───────────────────────────────────────────────────────────
-- La evalúan las políticas RLS como quien consulta, así que la ejecutan anon y
-- authenticated (como `is_member`). Solo responde sí/no sobre un módulo.
create or replace function business_module_on(p_business_id bigint, p_module text)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(
    (select case p_module
              when 'store' then b.store_enabled
              when 'team'  then b.team_enabled
            end
       from business b
      where b.id = p_business_id),
    false
  );
$$;

revoke execute on function business_module_on(bigint, text) from public;
grant  execute on function business_module_on(bigint, text) to anon, authenticated;

-- ── Tienda: productos y ventas ──────────────────────────────────────────────
-- Mismas políticas FOR ALL de la base, más la condición del módulo. El `(select …)`
-- hace que Postgres la evalúe una vez por consulta y no una vez por fila.
drop policy if exists product_all on product;
create policy product_all on product
  using (is_member(business_id) and (select business_module_on(business_id, 'store')))
  with check (is_member(business_id) and (select business_module_on(business_id, 'store')));

drop policy if exists sale_all on sale;
create policy sale_all on sale
  using (is_member(business_id) and (select business_module_on(business_id, 'store')))
  with check (is_member(business_id) and (select business_module_on(business_id, 'store')));

-- ── Equipo: personas del equipo ─────────────────────────────────────────────
-- Leer sigue igual: los recibos de citas viejas muestran quién atendió aunque el
-- módulo esté apagado (los datos se conservan). Escribir exige el módulo.
drop policy if exists employee_all on employee;
create policy employee_select on employee for select
  using (is_member(business_id));
create policy employee_insert on employee for insert
  with check (is_member(business_id) and (select business_module_on(business_id, 'team')));
create policy employee_update on employee for update
  using (is_member(business_id) and (select business_module_on(business_id, 'team')))
  with check (is_member(business_id) and (select business_module_on(business_id, 'team')));
create policy employee_delete on employee for delete
  using (is_member(business_id) and (select business_module_on(business_id, 'team')));

-- ── Equipo: quién atendió cada servicio ─────────────────────────────────────
-- `complete_appointment` (security definer) escribe `appointment_service.employee_id`
-- desde `p_lines`. Un trigger lo cubre sin recrear esa función: con el módulo
-- apagado no se puede ASIGNAR a nadie. Dejarlo en null o no cambiarlo sí se puede.
create or replace function appointment_service_team_guard()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if new.employee_id is not null
     and (tg_op = 'INSERT' or new.employee_id is distinct from old.employee_id)
     and not business_module_on(new.business_id, 'team') then
    raise exception 'El módulo Equipo no está activo en este negocio.';
  end if;
  return new;
end; $$;

drop trigger if exists appointment_service_team_guard on appointment_service;
create trigger appointment_service_team_guard
  before insert or update of employee_id on appointment_service
  for each row execute function appointment_service_team_guard();

-- ── admin_set_module ────────────────────────────────────────────────────────
-- Activa o desactiva un módulo de un negocio. Mismo patrón que admin_set_exempt.
create or replace function admin_set_module(p_business_id bigint, p_module text, p_enabled boolean)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_enabled is null then
    raise exception 'Falta indicar si el módulo queda activo';
  end if;
  if p_module is null or p_module not in ('store', 'team') then
    raise exception 'Ese módulo no existe';
  end if;
  if not exists (select 1 from business b where b.id = p_business_id) then
    raise exception 'El negocio no existe';
  end if;

  if p_module = 'store' then
    update business set store_enabled = p_enabled where id = p_business_id;
  else
    update business set team_enabled = p_enabled where id = p_business_id;
  end if;
end; $$;

revoke execute on function admin_set_module(bigint, text, boolean) from public, anon;
grant  execute on function admin_set_module(bigint, text, boolean) to authenticated;

-- ── admin_list_businesses: con los módulos ──────────────────────────────────
-- Mismo cuerpo que 20261105000001 más dos columnas al final. Cambia el tipo de
-- retorno, así que se borra y se crea de nuevo (y se vuelven a dar permisos).
drop function if exists admin_list_businesses();

create function admin_list_businesses()
returns table (
  business_id         bigint,
  name                text,
  slug                text,
  plan                text,
  trial_ends_at       timestamptz,
  paid_until          timestamptz,
  exempt              boolean,
  status              text,
  last_payment_at     timestamptz,
  last_payment_cents  bigint,
  owner_name          text,
  owner_whatsapp      text,
  business_type       text,
  store_enabled       boolean,
  team_enabled        boolean
) language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
  select b.id,
         b.name,
         p.public_slug,
         s.plan,
         s.trial_ends_at,
         s.paid_until,
         s.exempt,
         subscription_status(b.id),
         lp.created_at,
         lp.amount_cents,
         o.owner_name,
         o.owner_whatsapp,
         o.business_type,
         b.store_enabled,
         b.team_enabled
    from business b
    left join business_subscription s  on s.business_id = b.id
    left join booking_policy p         on p.business_id = b.id
    left join business_owner_profile o on o.business_id = b.id
    left join lateral (
      select sp.created_at, sp.amount_cents
        from subscription_payment sp
       where sp.business_id = b.id
       order by sp.created_at desc, sp.id desc
       limit 1
    ) lp on true
   order by b.id;
end; $$;

revoke execute on function admin_list_businesses() from public, anon;
grant  execute on function admin_list_businesses() to authenticated;
