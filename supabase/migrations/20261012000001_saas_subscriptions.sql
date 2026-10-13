-- Suscripciones: cada negocio paga un plan mensual a Citelis (S2 de
-- odd/tasks/saas-subscriptions.md). Esta migración solo guarda y calcula el ESTADO;
-- el bloqueo en el servidor (is_member, RPC públicas) y las RPC del administrador
-- llegan en S3 y S4.
--
-- QUÉ HACE
--   1. `platform_admin`: quién administra la plataforma. Solo se llena por migración
--      o SQL; ninguna usuaria la lee ni la escribe desde la API (RLS sin políticas y
--      privilegios revocados). Nadie puede darse ese permiso desde la app.
--   2. `business_subscription`: una fila por negocio (plan, fin de prueba, pagado
--      hasta, exento). La dueña la LEE; solo se escribe por SQL o por RPC futuras.
--   3. `subscription_payment`: un pago es un hecho histórico, append-only (como la
--      INVARIANTE 2): extender la fecha añade una fila, nunca edita una anterior.
--   4. `is_platform_admin()`, `subscription_status()` y `business_operational()`.
--      `subscription_status` es el espejo en SQL de src/lib/domain/subscription.ts:
--      si cambia una regla, cambian las dos.
--   5. Backfill: los negocios que ya existen quedan EXENTOS hasta que el administrador
--      lo quite.
--   6. `create_business` crea además la prueba de 14 días.
--
-- ADITIVA: tablas y funciones nuevas, y una fila nueva por negocio existente.

-- ── platform_admin ──────────────────────────────────────────────────────────

create table if not exists platform_admin (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Sin políticas y sin privilegios: la consulta solo la hace `is_platform_admin()`.
alter table platform_admin enable row level security;
revoke all on platform_admin from anon, authenticated;

-- ── business_subscription ───────────────────────────────────────────────────

create table if not exists business_subscription (
  business_id    bigint      primary key references business (id) on delete cascade,
  plan           text        not null default 'standard',
  trial_ends_at  timestamptz not null,
  paid_until     timestamptz,
  exempt         boolean     not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table business_subscription enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'business_subscription'
       and policyname = 'business_subscription_select'
  ) then
    create policy business_subscription_select on business_subscription
      for select to authenticated using (is_member(business_id));
  end if;
end $$;

-- La dueña solo lee: nadie se extiende la prueba ni se quita el bloqueo desde la app.
revoke all on business_subscription from anon, authenticated;
grant select on business_subscription to authenticated;

-- ── subscription_payment ────────────────────────────────────────────────────

create table if not exists subscription_payment (
  id           bigint      generated always as identity primary key,
  business_id  bigint      not null references business (id) on delete cascade,
  amount_cents bigint      not null check (amount_cents >= 0),
  paid_until   timestamptz not null,
  method       text        not null check (method in ('TRANSFER', 'CASH', 'CARD', 'OTHER')),
  note         text,
  recorded_by  uuid        references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists subscription_payment_business_idx
  on subscription_payment (business_id, created_at desc);

alter table subscription_payment enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'subscription_payment'
       and policyname = 'subscription_payment_select'
  ) then
    create policy subscription_payment_select on subscription_payment
      for select to authenticated using (is_member(business_id));
  end if;
end $$;

revoke all on subscription_payment from anon, authenticated;
grant select on subscription_payment to authenticated;

-- APPEND-ONLY. Un pago es un hecho histórico (INVARIANTE 2): ni siquiera postgres
-- lo edita ni lo borra. Dos excepciones, ambas necesarias para que la base siga
-- funcionando:
--   · Borrar el negocio entero: la cascada borra sus pagos. Se reconoce porque en ese
--     momento el negocio YA no existe (los borrados en cascada corren después de
--     borrar la fila padre), y así no depende del orden de la cascada. Es security
--     definer para que la RLS de `business` no oculte la fila al comprobarlo.
--   · Borrar la cuenta de quien registró el pago: `on delete set null` pone
--     `recorded_by` en NULL. Es lo único que una edición puede cambiar.
create or replace function subscription_payment_append_only()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from business b where b.id = old.business_id) then
      raise exception 'Un pago de suscripción no se edita ni se borra: es un hecho histórico.';
    end if;
    return old;
  end if;

  -- UPDATE: solo se tolera anular `recorded_by` (cuenta borrada); el resto igual.
  if new.recorded_by is null
     and (new.id, new.business_id, new.amount_cents, new.paid_until, new.method, new.note, new.created_at)
         is not distinct from
         (old.id, old.business_id, old.amount_cents, old.paid_until, old.method, old.note, old.created_at)
  then
    return new;
  end if;
  raise exception 'Un pago de suscripción no se edita ni se borra: es un hecho histórico.';
end; $$;

drop trigger if exists subscription_payment_append_only on subscription_payment;
create trigger subscription_payment_append_only
  before update or delete on subscription_payment
  for each row execute function subscription_payment_append_only();

-- ── Funciones de estado ─────────────────────────────────────────────────────

create or replace function is_platform_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from platform_admin where user_id = auth.uid());
$$;

-- Espejo de `subscriptionStatus` (src/lib/domain/subscription.ts), mismo orden:
-- exento > pago vigente > prueba vigente > gracia (7 días desde lo último que
-- venció) > bloqueado. Sin fila de suscripción devuelve NULL.
create or replace function subscription_status(p_business_id bigint)
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select case
           when s.exempt then 'EXEMPT'
           when s.paid_until > now() then 'ACTIVE'
           when s.trial_ends_at > now() then 'TRIAL'
           when now() < greatest(s.trial_ends_at, coalesce(s.paid_until, s.trial_ends_at))
                        + interval '7 days' then 'GRACE'
           else 'BLOCKED'
         end
    from business_subscription s
   where s.business_id = p_business_id;
$$;

-- Un negocio SIN fila cuenta como operativo: es el default seguro (un hueco no debe
-- tumbar a una dueña). No hay riesgo real: el backfill de abajo cubre a todos los
-- negocios existentes y `create_business` crea la fila de los nuevos.
create or replace function business_operational(p_business_id bigint)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(subscription_status(p_business_id) <> 'BLOCKED', true);
$$;

revoke execute on function is_platform_admin()              from public, anon;
revoke execute on function subscription_status(bigint)      from public, anon;
revoke execute on function business_operational(bigint)     from public, anon;
grant  execute on function is_platform_admin()              to authenticated;
grant  execute on function subscription_status(bigint)      to authenticated;
grant  execute on function business_operational(bigint)     to authenticated;

-- ── Backfill: los negocios existentes quedan exentos ────────────────────────
-- Idempotente: no pisa una fila que el administrador ya haya tocado.
insert into business_subscription (business_id, trial_ends_at, exempt)
select b.id, now(), true from business b
on conflict (business_id) do nothing;

-- ── create_business: añade la prueba de 14 días ─────────────────────────────
-- Mismo cuerpo que 20261010000005; solo cambia lo marcado con "NUEVO".
create or replace function create_business(
  p_name        text,
  p_theme_color text default null,
  p_slug        text default null
)
returns bigint language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  new_id    bigint;
  base_slug text;
  try_slug  text;
  attempt   integer := 1;
  v_index   text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;

  if exists (select 1 from business where created_by = auth.uid()) then
    raise exception 'Tu cuenta ya creó un negocio. Cada cuenta puede crear uno solo.';
  end if;

  new_id := nextval('business_id_seq');
  begin
    insert into business (id, name, plan, created_by)
    values (new_id, p_name, 'mvp', auth.uid());
  exception when unique_violation then
    get stacked diagnostics v_index = constraint_name;
    if v_index = 'business_created_by_unique' then
      raise exception 'Tu cuenta ya creó un negocio. Cada cuenta puede crear uno solo.';
    end if;
    raise;
  end;

  -- NUEVO · La prueba gratis de 14 días (TRIAL_DAYS en el dominio puro). Va en la
  -- misma transacción que el alta: un negocio nunca existe sin su suscripción.
  insert into business_subscription (business_id, trial_ends_at, exempt)
  values (new_id, now() + interval '14 days', false);

  if p_theme_color ~ '^#[0-9a-fA-F]{6}$' then
    update business set theme_color = p_theme_color where id = new_id;
  end if;

  if p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(p_slug) <= 40 then
    base_slug := p_slug;
  else
    base_slug := 'negocio-' || new_id;
  end if;

  try_slug := base_slug;
  loop
    begin
      insert into booking_policy (business_id, public_slug) values (new_id, try_slug);
      exit;
    exception when unique_violation then
      attempt := attempt + 1;
      try_slug := case
        when attempt > 50 then 'negocio-' || new_id || '-' || attempt
        else base_slug || '-' || attempt
      end;
    end;
  end loop;

  insert into business_member (user_id, business_id) values (auth.uid(), new_id);
  return new_id;
end; $$;

revoke execute on function create_business(text, text, text) from public;
revoke execute on function create_business(text, text, text) from anon;
grant  execute on function create_business(text, text, text) to authenticated;
