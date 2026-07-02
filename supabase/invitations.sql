-- Onboarding + invitaciones (Slice 4.5). ADITIVO e idempotente: puedes correrlo
-- en una base existente SIN perder datos (no borra nada).
-- Las operaciones sensibles van por funciones SECURITY DEFINER (validan y luego
-- escriben), así business_member queda cerrado a escrituras directas (nadie se
-- cuela a un negocio ajeno).

-- Tabla de invitaciones (sin políticas RLS: solo se accede vía funciones).
create table if not exists invitation (
  code        text primary key,
  business_id bigint not null references business (id) on delete cascade,
  created_by  uuid not null,
  created_at  timestamptz not null default now()
);
alter table invitation enable row level security;

-- Secuencia para ids de negocios creados desde la app (arranca alto para no
-- chocar con negocios existentes como el id 1).
create sequence if not exists business_id_seq start 1000;

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

-- Permitir que los usuarios autenticados ejecuten las funciones.
grant execute on function create_business(text) to authenticated;
grant execute on function create_invitation() to authenticated;
grant execute on function redeem_invitation(text) to authenticated;
