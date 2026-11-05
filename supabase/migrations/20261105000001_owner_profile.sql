-- Perfil de quien administra el negocio (odd/tasks/owner-profile.md): nombre,
-- WhatsApp y tipo de negocio. Se pide al registrarse (`create_business`) y, a los
-- negocios que ya existían, una sola vez al entrar (`owner_profile_pending` +
-- `save_owner_profile`). El administrador de la plataforma lo ve en
-- `admin_list_businesses`.
--
-- PRIVACIDAD (S6)
--   El WhatsApp es personal. `business` lo lee todo el equipo (RLS por miembro), así
--   que el perfil vive en su propia tabla SIN ningún privilegio para `anon` ni
--   `authenticated`: solo se toca a través de estas funciones `security definer`.
--
-- COMPATIBILIDAD (S8)
--   Los tres parámetros nuevos de `create_business` tienen default: el front anterior
--   sigue creando negocios contra esta base. Ese negocio queda sin perfil y se le
--   pide al entrar, igual que a los antiguos.
--
-- ADITIVA: una tabla nueva, funciones nuevas y dos funciones recreadas con más
-- parámetros/columnas. No cambia ninguna fila existente.

-- ── Tabla ───────────────────────────────────────────────────────────────────
create table business_owner_profile (
  business_id    bigint primary key references business (id) on delete cascade,
  user_id        uuid references auth.users (id) on delete set null,
  owner_name     text not null check (char_length(owner_name) between 2 and 80),
  owner_whatsapp text not null check (client_phone_is_valid(owner_whatsapp)),
  business_type  text not null
                 check (business_type in ('salon', 'barbershop', 'nails', 'lashes', 'spa', 'other')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- RLS activa y sin políticas, y además sin privilegios: ni leer ni escribir desde la API.
alter table business_owner_profile enable row level security;
revoke all on business_owner_profile from public, anon, authenticated;

-- ── Validación compartida ───────────────────────────────────────────────────
-- Misma regla que `validateOwnerProfile` (src/lib/domain/ownerProfile.ts): si una
-- cambia, cambia la otra. Devuelve el nombre limpio (espacios recortados y colapsados).
create or replace function owner_profile_clean_name(
  p_owner_name     text,
  p_owner_whatsapp text,
  p_business_type  text
)
returns text language plpgsql immutable
set search_path = public, pg_temp as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_owner_name, '')), '\s+', ' ', 'g');
begin
  if char_length(v_name) < 2 then raise exception 'Escribe tu nombre.'; end if;
  if char_length(v_name) > 80 then raise exception 'El nombre es muy largo (máximo 80 caracteres).'; end if;
  if coalesce(btrim(p_owner_whatsapp), '') = '' then raise exception 'Escribe tu WhatsApp.'; end if;
  if not client_phone_is_valid(p_owner_whatsapp) then raise exception 'El WhatsApp no es válido.'; end if;
  if p_business_type is null
     or p_business_type not in ('salon', 'barbershop', 'nails', 'lashes', 'spa', 'other') then
    raise exception 'Elige el tipo de negocio.';
  end if;
  return v_name;
end; $$;

revoke execute on function owner_profile_clean_name(text, text, text) from public, anon, authenticated;

-- ── create_business: acepta el perfil ───────────────────────────────────────
-- Mismo cuerpo que 20261012000001; solo cambia lo marcado con "NUEVO". La firma
-- cambia, así que se borra la anterior para no dejar dos sobrecargas.
drop function if exists create_business(text, text, text);

create or replace function create_business(
  p_name           text,
  p_theme_color    text default null,
  p_slug           text default null,
  p_owner_name     text default null,
  p_owner_whatsapp text default null,
  p_business_type  text default null
)
returns bigint language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  new_id     bigint;
  base_slug  text;
  try_slug   text;
  attempt    integer := 1;
  v_index    text;
  v_owner    text;   -- NUEVO
  v_profiled boolean := p_owner_name is not null or p_owner_whatsapp is not null or p_business_type is not null;  -- NUEVO
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;

  if exists (select 1 from business where created_by = auth.uid()) then
    raise exception 'Tu cuenta ya creó un negocio. Cada cuenta puede crear uno solo.';
  end if;

  -- NUEVO · Si llega algo del perfil, tiene que llegar completo y válido. Se valida
  -- antes de crear nada; sin perfil (front anterior) se crea igual y se pide al entrar.
  if v_profiled then
    v_owner := owner_profile_clean_name(p_owner_name, p_owner_whatsapp, p_business_type);
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

  -- NUEVO · El perfil, en la misma transacción que el alta.
  if v_profiled then
    insert into business_owner_profile (business_id, user_id, owner_name, owner_whatsapp, business_type)
    values (new_id, auth.uid(), v_owner, btrim(p_owner_whatsapp), p_business_type);
  end if;

  return new_id;
end; $$;

revoke execute on function create_business(text, text, text, text, text, text) from public;
revoke execute on function create_business(text, text, text, text, text, text) from anon;
grant  execute on function create_business(text, text, text, text, text, text) to authenticated;

-- ── ¿A quién se le pide? ────────────────────────────────────────────────────
-- El negocio "administrado" por quien llama: el que creó, o, si es un negocio
-- antiguo sin creador conocido (created_by nulo), aquel del que es miembro. Quien
-- entró con una invitación a un negocio con creador NUNCA es el objetivo.
create or replace function owner_profile_target()
returns bigint language sql stable security definer
set search_path = public, pg_temp as $$
  select b.id
    from business b
    join business_member m on m.business_id = b.id and m.user_id = auth.uid()
   where b.created_by = auth.uid() or b.created_by is null
   order by (b.created_by = auth.uid()) desc nulls last, b.id
   limit 1;
$$;

revoke execute on function owner_profile_target() from public, anon, authenticated;

-- true = hay que pedirle los datos al entrar (S3). Nunca expone el perfil.
create or replace function owner_profile_pending()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(
    (select not exists (select 1 from business_owner_profile p where p.business_id = t.id)
       from (select owner_profile_target() as id) t
      where t.id is not null),
    false
  );
$$;

revoke execute on function owner_profile_pending() from public, anon;
grant  execute on function owner_profile_pending() to authenticated;

-- Guarda (o corrige) el perfil del negocio que administra quien llama.
create or replace function save_owner_profile(
  p_owner_name     text,
  p_owner_whatsapp text,
  p_business_type  text
)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_target bigint;
  v_owner  text;
  v_rows   integer;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  v_target := owner_profile_target();
  if v_target is null then
    raise exception 'Solo quien administra el negocio puede completar estos datos.' using errcode = '42501';
  end if;
  v_owner := owner_profile_clean_name(p_owner_name, p_owner_whatsapp, p_business_type);

  insert into business_owner_profile (business_id, user_id, owner_name, owner_whatsapp, business_type)
  values (v_target, auth.uid(), v_owner, btrim(p_owner_whatsapp), p_business_type)
  on conflict (business_id) do update
     set user_id        = excluded.user_id,
         owner_name     = excluded.owner_name,
         owner_whatsapp = excluded.owner_whatsapp,
         business_type  = excluded.business_type,
         updated_at     = now()
   -- Solo corrige quien lo guardó. Importa en negocios antiguos sin creador, donde
   -- cualquier miembro es objetivo: el primero que lo completa queda como dueño del dato.
   where business_owner_profile.user_id is null
      or business_owner_profile.user_id = auth.uid();

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Estos datos ya los completó otra persona del negocio.' using errcode = '42501';
  end if;
end; $$;

revoke execute on function save_owner_profile(text, text, text) from public, anon;
grant  execute on function save_owner_profile(text, text, text) to authenticated;

-- ── admin_list_businesses: con el perfil (S4) ───────────────────────────────
-- Mismo cuerpo que 20261012000003 más tres columnas al final. Cambia el tipo de
-- retorno, así que hay que borrarla y crearla de nuevo (y volver a dar permisos).
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
  business_type       text
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
         o.business_type
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
