-- Módulo de ropa (Slice ropa). ADITIVO e idempotente: córrelo en tu base sin
-- perder datos. Tablas separadas de servicios (INVARIANTE 3). Ids provistos por
-- el cliente (bigint). Dinero en centavos. Aislamiento por tenant vía RLS.

create table if not exists product (
  id          bigint primary key,
  business_id bigint  not null references business (id) on delete cascade,
  name        text    not null,
  price       bigint  not null default 0, -- centavos, venta
  cost        bigint  not null default 0, -- centavos, costo
  stock       integer not null default 0  -- unidades disponibles
);

create table if not exists sale (
  id          bigint primary key,
  business_id bigint  not null references business (id) on delete cascade,
  product_id  bigint  not null references product (id),
  quantity    integer not null,
  unit_price  bigint  not null, -- congelado al vender
  unit_cost   bigint  not null, -- congelado al vender
  datetime    text    not null, -- ISO 8601
  client      text    not null default '', -- quién compró (para fiado)
  paid        bigint  not null default 0    -- pagado; < total ⇒ a crédito
);

alter table product enable row level security;
alter table sale    enable row level security;

create policy product_all on product
  using (is_member(business_id)) with check (is_member(business_id));
create policy sale_all on sale
  using (is_member(business_id)) with check (is_member(business_id));
