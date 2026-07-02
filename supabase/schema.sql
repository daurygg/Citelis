-- Citelis — esquema Postgres para Supabase (Slice 4).
-- Ejecuta TODO este script en el SQL Editor de Supabase (una vez).
-- Reglas del proyecto: dinero en CENTAVOS enteros; aislamiento por tenant vía RLS
-- (INVARIANTE 1). Los ids son numéricos (bigint) para no tocar la capa de dominio.

-- ── Tablas ────────────────────────────────────────────────────────────────

create table if not exists business (
  id   bigint generated always as identity primary key,
  name text not null,
  plan text not null default 'mvp'
);

-- Mapea cada usuario autenticado a su negocio. Permite VARIOS usuarios por negocio
-- (Roelis + una ayudante comparten el mismo business_id).
create table if not exists business_member (
  user_id     uuid   not null references auth.users (id) on delete cascade,
  business_id bigint not null references business (id) on delete cascade,
  primary key (user_id, business_id)
);

create table if not exists service (
  id             bigint generated always as identity primary key,
  business_id    bigint  not null references business (id) on delete cascade,
  name           text    not null,
  price          bigint  not null default 0,   -- centavos
  supply_cost    bigint  not null default 0,   -- centavos (cache, INVARIANTE 6)
  cost_override  bigint,                        -- centavos o null
  duration_min   integer not null default 0,
  variable_price boolean not null default false
);

create table if not exists supply (
  id             bigint  generated always as identity primary key,
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

create table if not exists appointment (
  id            bigint generated always as identity primary key,
  business_id   bigint not null references business (id) on delete cascade,
  service_id    bigint not null references service (id),
  client        text   not null,
  datetime      text   not null,   -- ISO 8601 (coherente con el dominio)
  status        text   not null,   -- PENDING | IN_PROGRESS | COMPLETED | CANCELED | NO_SHOW
  charged_price bigint,            -- congelados al COMPLETAR (INVARIANTE 2)
  actual_cost   bigint,
  profit        bigint
);

create table if not exists fixed_expense (
  id          bigint generated always as identity primary key,
  business_id bigint not null references business (id) on delete cascade,
  concept     text   not null,
  amount      bigint not null default 0, -- centavos
  period      text   not null default 'MONTHLY'
);

-- ── Row Level Security (INVARIANTE 1 a nivel de base de datos) ──────────────

-- ¿El usuario actual pertenece a este negocio?
create or replace function is_member(b bigint)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from business_member m
    where m.business_id = b and m.user_id = auth.uid()
  );
$$;

alter table business        enable row level security;
alter table business_member enable row level security;
alter table service         enable row level security;
alter table supply          enable row level security;
alter table service_supply  enable row level security;
alter table appointment     enable row level security;
alter table fixed_expense   enable row level security;

-- El usuario solo ve negocios/membresías propios.
create policy business_select on business
  for select using (is_member(id));
create policy member_select on business_member
  for select using (user_id = auth.uid());

-- Tablas de datos: toda operación (select/insert/update/delete) filtra por tenant.
create policy service_all on service
  using (is_member(business_id)) with check (is_member(business_id));
create policy supply_all on supply
  using (is_member(business_id)) with check (is_member(business_id));
create policy service_supply_all on service_supply
  using (is_member(business_id)) with check (is_member(business_id));
create policy appointment_all on appointment
  using (is_member(business_id)) with check (is_member(business_id));
create policy fixed_expense_all on fixed_expense
  using (is_member(business_id)) with check (is_member(business_id));
