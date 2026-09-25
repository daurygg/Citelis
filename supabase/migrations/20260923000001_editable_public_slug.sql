-- La dueña puede cambiar su dirección pública sin romper los enlaces repartidos.
-- (odd/tasks/editable-public-slug.md, T1)
--
-- EL PROBLEMA
--   El slug se derivaba del nombre al crear el negocio y después no lo tocaba
--   nadie. Si se equivocó tecleando, o cambió de nombre comercial, se quedaba
--   así para siempre; la única salida era un `update` a mano en la base, que es
--   lo que hubo que hacer con `negocio-1001`, rompiendo el enlace anterior.
--
-- LA DECISIÓN
--   Las direcciones abandonadas NO se tiran: se archivan y siguen llevando al
--   negocio. Romper un enlace repartido es un daño invisible — nadie le escribe
--   a la dueña para avisarle de que su dirección ya no sirve.
--
-- DÓNDE VIVE LA REDIRECCIÓN
--   Aquí solo se guarda y se resuelve. La redirección de verdad la hace el
--   portal: si el slug no existe, pregunta por el actual y corrige la URL. Se
--   descartó resolver el alias dentro de las cuatro RPC públicas porque obligaba
--   a reescribir `public_request_booking` — 100 líneas de validaciones con su
--   propia regresión H1–H6 — a cambio de nada que el portal no pueda hacer.
--
-- ADITIVO: no borra ni una fila.

-- ── Las direcciones abandonadas ────────────────────────────────────────────
-- Un slug pertenece a su negocio PARA SIEMPRE, aunque lo suelte. Si se liberara,
-- otro negocio podría quedarse con el tráfico que el primero repartió.
create table if not exists booking_slug_history (
  slug        text primary key,
  business_id bigint not null references business(id) on delete cascade,
  replaced_at timestamptz not null default now()
);

create index if not exists booking_slug_history_business_idx
  on booking_slug_history (business_id);

-- RLS activa y SIN policies, igual que `invitation`: a esta tabla solo se llega
-- por las funciones de abajo, que corren como propietarias.
alter table booking_slug_history enable row level security;

-- ── Resolver una dirección abandonada ──────────────────────────────────────
-- Devuelve la dirección ACTUAL del negocio que un día usó `p_slug`, o null.
-- Exige el portal abierto, como el resto de funciones públicas: un portal
-- cerrado no debe filtrar a dónde se mudó.
create or replace function resolve_public_slug(p_slug text)
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select p.public_slug
    from booking_slug_history h
    join booking_policy p on p.business_id = h.business_id
   where h.slug = p_slug
     and p.enabled;
$$;

revoke execute on function resolve_public_slug(text) from public;
grant  execute on function resolve_public_slug(text) to anon, authenticated;

-- ── Cambiar la dirección ───────────────────────────────────────────────────
-- El negocio va EXPLÍCITO y se comprueba la membresía (INVARIANTE 1). La primera
-- versión lo deducía de `business_member` con un `limit 1`: con una dueña que
-- pertenece a más de un negocio, cambiaba la dirección del equivocado — y en
-- silencio, porque devolvía el slug nuevo como si hubiera funcionado. Lo cazó la
-- regresión, no una revisión.
create or replace function set_public_slug(p_business_id bigint, p_slug text)
returns text language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_current text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not is_member(p_business_id) then raise exception 'Ese negocio no es tuyo.'; end if;

  -- Mismo contrato que `isValidSlug` en src/lib/domain/slug.ts. El mensaje va en
  -- el idioma de la dueña porque la UI lo enseña tal cual (INVARIANTE 4).
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug) > 40 then
    raise exception 'La dirección solo puede llevar letras sin acentos, números y guiones.';
  end if;

  select public_slug into v_current from booking_policy where business_id = p_business_id;
  if v_current is null then raise exception 'Tu negocio todavía no tiene página de reservas.'; end if;
  if v_current = p_slug then return v_current; end if;

  if exists (select 1 from booking_policy      where public_slug = p_slug and business_id <> p_business_id)
  or exists (select 1 from booking_slug_history where slug        = p_slug and business_id <> p_business_id) then
    raise exception 'Esa dirección ya la usa otro negocio. Prueba con otra.';
  end if;

  -- La que se abandona pasa a redirigir.
  insert into booking_slug_history (slug, business_id)
  values (v_current, p_business_id)
      on conflict (slug) do update set business_id = excluded.business_id, replaced_at = now();

  -- Si vuelve a una suya antigua, deja de ser histórica: vuelve a ser la actual.
  delete from booking_slug_history where slug = p_slug and business_id = p_business_id;

  update booking_policy set public_slug = p_slug where business_id = p_business_id;
  return p_slug;
end; $$;

revoke execute on function set_public_slug(bigint, text) from public;
revoke execute on function set_public_slug(bigint, text) from anon;
grant  execute on function set_public_slug(bigint, text) to authenticated;

-- ── El grant por columna ───────────────────────────────────────────────────
-- Sin esto la función es una sugerencia: `booking_policy` tiene policy ALL, así
-- que el cliente podría escribir `public_slug` directo y dejar el historial
-- cojo. RLS decide qué filas, nunca qué columnas; acotar columnas solo se puede
-- con grants. Se conceden todas las demás, que son las que edita la pantalla de
-- reservas. `business_id` queda fuera a propósito.
revoke update on booking_policy from anon, authenticated;
grant  update (enabled, slot_step_min, buffer_min, min_notice_hours,
               max_horizon_days, max_requests_per_phone_per_day, timezone)
  on booking_policy to authenticated;
