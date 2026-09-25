-- Baseline del esquema que ya existía en la base antes de adoptar migraciones.
--
-- Consolida schema.sql, invitations.sql, inventory.sql, appointment-columns.sql,
-- fixed-expense-month.sql y sale-credit-columns.sql en una sola foto del estado
-- de partida. Esos seis archivos se aplicaron a mano por el editor SQL y no
-- dejaron historial; esta migración lo registra sin re-ejecutar nada destructivo.
--
-- A diferencia de schema.sql, aquí NO hay `drop table`. Es idempotente de
-- verdad: correrla contra una base con datos no borra ni una fila.
--
-- Reglas del proyecto: dinero en CENTAVOS enteros; aislamiento por tenant vía RLS.

-- ── Tablas ──────────────────────────────────────────────────────────────────

create table if not exists business (
  id   bigint primary key,
  name text not null,
  plan text not null default 'mvp'
);

-- Mapea cada usuario autenticado a su negocio. Permite VARIOS usuarios por
-- negocio (la dueña y una ayudante comparten el mismo business_id).
create table if not exists business_member (
  user_id     uuid   not null references auth.users (id) on delete cascade,
  business_id bigint not null references business (id) on delete cascade,
  primary key (user_id, business_id)
);

create table if not exists service (
  id             bigint primary key,
  business_id    bigint  not null references business (id) on delete cascade,
  name           text    not null,
  price          bigint  not null default 0,   -- centavos
  supply_cost    bigint  not null default 0,   -- centavos (cache, INVARIANTE 6)
  cost_override  bigint,                       -- centavos o null
  duration_min   integer not null default 0,
  variable_price boolean not null default false
);

create table if not exists supply (
  id             bigint  primary key,
  business_id    bigint  not null references business (id) on delete cascade,
  name           text    not null,
  purchase_price bigint  not null default 0,   -- centavos
  servings       integer not null default 1
);

-- Relación N↔N servicio↔insumo (insumos compartidos).
create table if not exists service_supply (
  business_id bigint not null references business (id) on delete cascade,
  service_id  bigint not null references service (id) on delete cascade,
  supply_id   bigint not null references supply (id) on delete cascade,
  primary key (service_id, supply_id)
);

-- quoted_price y deposit venían de appointment-columns.sql, ya absorbido.
create table if not exists appointment (
  id            bigint primary key,
  business_id   bigint not null references business (id) on delete cascade,
  service_id    bigint not null references service (id),
  client        text   not null,
  datetime      text   not null,   -- ISO 8601 (coherente con el dominio)
  status        text   not null,   -- PENDING | IN_PROGRESS | COMPLETED | CANCELED | NO_SHOW
  quoted_price  bigint,            -- precio acordado al agendar (opcional)
  deposit       bigint,            -- abono/adelanto pagado al reservar (opcional)
  charged_price bigint,            -- congelados al COMPLETAR (INVARIANTE 2)
  actual_cost   bigint,
  profit        bigint
);

-- month venía de fixed-expense-month.sql, ya absorbido.
create table if not exists fixed_expense (
  id          bigint primary key,
  business_id bigint not null references business (id) on delete cascade,
  concept     text   not null,
  amount      bigint not null default 0, -- centavos
  month       text   not null,           -- 'YYYY-MM' al que corresponde
  period      text   not null default 'MONTHLY'
);

-- Invitaciones: sin policies RLS a propósito. Solo se accede vía las funciones
-- SECURITY DEFINER de abajo, que validan antes de escribir.
create table if not exists invitation (
  code        text primary key,
  business_id bigint not null references business (id) on delete cascade,
  created_by  uuid not null,
  created_at  timestamptz not null default now()
);

-- Módulo de ropa. Tablas separadas de servicios (INVARIANTE 3).
create table if not exists product (
  id          bigint primary key,
  business_id bigint  not null references business (id) on delete cascade,
  name        text    not null,
  price       bigint  not null default 0, -- centavos, venta
  cost        bigint  not null default 0, -- centavos, costo
  stock       integer not null default 0  -- unidades disponibles
);

-- client y paid venían de sale-credit-columns.sql, ya absorbido.
create table if not exists sale (
  id          bigint  primary key,
  business_id bigint  not null references business (id) on delete cascade,
  product_id  bigint  not null references product (id),
  quantity    integer not null,
  unit_price  bigint  not null,            -- congelado al vender
  unit_cost   bigint  not null,            -- congelado al vender
  datetime    text    not null,            -- ISO 8601
  client      text    not null default '', -- quién compró (para fiado)
  paid        bigint  not null default 0   -- pagado; < total ⇒ a crédito
);

-- ── Secuencias ──────────────────────────────────────────────────────────────

-- Ids de negocios creados desde la app. Arranca alto para no chocar con
-- negocios existentes como el id 1.
create sequence if not exists business_id_seq start 1000;

-- ── Funciones ───────────────────────────────────────────────────────────────

-- ¿El usuario actual pertenece a este negocio?
create or replace function is_member(b bigint)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from business_member m
    where m.business_id = b and m.user_id = auth.uid()
  );
$$;

-- Crear un negocio y quedar como miembro (dueña).
create or replace function create_business(p_name text)
returns bigint language plpgsql security definer as $$
declare new_id bigint;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  new_id := nextval('business_id_seq');
  insert into business (id, name, plan) values (new_id, p_name, 'mvp');
  insert into business_member (user_id, business_id) values (auth.uid(), new_id);
  return new_id;
end; $$;

-- Generar un código de invitación para MI negocio (debo ser miembro).
create or replace function create_invitation()
returns text language plpgsql security definer as $$
declare my_business bigint; new_code text;
begin
  select business_id into my_business from business_member where user_id = auth.uid() limit 1;
  if my_business is null then raise exception 'No perteneces a ningún negocio'; end if;
  new_code := upper(substring(replace(gen_random_uuid()::text, '-', '') for 8));
  insert into invitation (code, business_id, created_by) values (new_code, my_business, auth.uid());
  return new_code;
end; $$;

-- Unirse a un negocio con un código válido.
create or replace function redeem_invitation(p_code text)
returns bigint language plpgsql security definer as $$
declare target_business bigint;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select business_id into target_business from invitation where code = upper(p_code);
  if target_business is null then raise exception 'Código inválido'; end if;
  insert into business_member (user_id, business_id) values (auth.uid(), target_business)
    on conflict do nothing;
  return target_business;
end; $$;

grant execute on function create_business(text) to authenticated;
grant execute on function create_invitation() to authenticated;
grant execute on function redeem_invitation(text) to authenticated;

-- ── Row Level Security (INVARIANTE 1 a nivel de base de datos) ──────────────

alter table business        enable row level security;
alter table business_member enable row level security;
alter table service         enable row level security;
alter table supply          enable row level security;
alter table service_supply  enable row level security;
alter table appointment     enable row level security;
alter table fixed_expense   enable row level security;
alter table invitation      enable row level security;
alter table product         enable row level security;
alter table sale            enable row level security;

-- Postgres no soporta `create policy if not exists`, así que cada una va
-- guardada por su propio bloque. Sin drops: esto no desprotege nada ni siquiera
-- por un instante.
do $$
begin
  -- El usuario solo ve negocios/membresías propios.
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'business' and policyname = 'business_select') then
    create policy business_select on business
      for select using (is_member(id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'business_member' and policyname = 'member_select') then
    create policy member_select on business_member
      for select using (user_id = auth.uid());
  end if;

  -- Tablas de datos: toda operación filtra por tenant.
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'service' and policyname = 'service_all') then
    create policy service_all on service
      using (is_member(business_id)) with check (is_member(business_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'supply' and policyname = 'supply_all') then
    create policy supply_all on supply
      using (is_member(business_id)) with check (is_member(business_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'service_supply' and policyname = 'service_supply_all') then
    create policy service_supply_all on service_supply
      using (is_member(business_id)) with check (is_member(business_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'appointment' and policyname = 'appointment_all') then
    create policy appointment_all on appointment
      using (is_member(business_id)) with check (is_member(business_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'fixed_expense' and policyname = 'fixed_expense_all') then
    create policy fixed_expense_all on fixed_expense
      using (is_member(business_id)) with check (is_member(business_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'product' and policyname = 'product_all') then
    create policy product_all on product
      using (is_member(business_id)) with check (is_member(business_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'sale' and policyname = 'sale_all') then
    create policy sale_all on sale
      using (is_member(business_id)) with check (is_member(business_id));
  end if;
end $$;
