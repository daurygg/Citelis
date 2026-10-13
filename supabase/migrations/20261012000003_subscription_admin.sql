-- RPC del administrador de la plataforma (S4 de odd/tasks/saas-subscriptions.md).
-- S2 guardó y calculó el estado y S3 lo aplicó; esta migración da al administrador las
-- tres operaciones que necesita el panel (S6): listar negocios, registrar un pago y
-- poner o quitar la exención.
--
-- DECISIONES
--   · Quien no es administrador RECIBE UN ERROR (sqlstate 42501, "No autorizado"), no
--     una lista vacía. Un panel que llama a una RPC sin permiso es un fallo de
--     programación o un intento de abuso, y el error se ve; el vacío lo escondería. Las
--     tres funciones se comportan igual.
--   · Las tres son `security definer` con el mismo `search_path` fijo que S2/S3 y
--     comprueban `is_platform_admin()` como PRIMERA sentencia, antes de leer o escribir.
--     Sin permiso para `public` ni `anon`; solo `authenticated` las ejecuta (y dentro,
--     solo el administrador).
--   · INVARIANTE 1 (tenant): estas RPC operan sobre TODOS los negocios a propósito, y
--     solo para el administrador de la plataforma. Cada lectura y escritura va acotada
--     por `business_id` del negocio pedido; ninguna toca datos de negocio (citas,
--     clientas, servicios), solo suscripción y pagos.
--   · `admin_register_payment` es atómica (una función = una transacción): bloquea la
--     fila de suscripción (`for update`), valida, inserta el pago y mueve `paid_until`
--     juntos. Dos administradores a la vez se serializan por ese bloqueo. No acorta
--     nunca `paid_until`: la fecha nueva tiene que ser POSTERIOR a la actual.
--   · `subscription_payment` sigue append-only: aquí solo se hace INSERT.
--
-- ENDURECIMIENTO MENOR (fuga anotada en S2): `subscription_status(b)` y
-- `business_operational(b)` estaban concedidas a `authenticated` para CUALQUIER id, así
-- que una usuaria podía averiguar si otro negocio está bloqueado. Todos sus llamadores
-- son funciones `security definer` (is_member, las RPC públicas, my_subscription y las
-- de abajo), que se ejecutan con los privilegios de su dueño, no con los de quien llama,
-- así que se les quita el permiso a `authenticated`. La pantalla de la dueña usa
-- `my_subscription()`, que sigue concedida.
--
-- ADITIVA: funciones nuevas y un REVOKE. No cambia ninguna fila.

-- ── admin_list_businesses ───────────────────────────────────────────────────
-- Una fila por negocio, el de menor id primero. Un negocio sin fila de suscripción
-- (no debería existir) sale con los campos de suscripción nulos y `status` nulo.
create or replace function admin_list_businesses()
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
  last_payment_cents  bigint
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
         lp.amount_cents
    from business b
    left join business_subscription s on s.business_id = b.id
    left join booking_policy p        on p.business_id = b.id
    left join lateral (
      select sp.created_at, sp.amount_cents
        from subscription_payment sp
       where sp.business_id = b.id
       order by sp.created_at desc, sp.id desc
       limit 1
    ) lp on true
   order by b.id;
end; $$;

-- ── admin_register_payment ──────────────────────────────────────────────────
-- Registra un pago y extiende `paid_until`. Devuelve el id del pago.
create or replace function admin_register_payment(
  p_business_id  bigint,
  p_amount_cents bigint,
  p_paid_until   timestamptz,
  p_method       text,
  p_note         text default null
)
returns bigint language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_current timestamptz;
  v_id      bigint;
begin
  if not is_platform_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'El monto debe ser mayor que cero';
  end if;
  if p_paid_until is null then
    raise exception 'Falta la fecha hasta la que queda pagado';
  end if;
  if p_method is null or p_method not in ('TRANSFER', 'CASH', 'CARD', 'OTHER') then
    raise exception 'Vía de pago inválida';
  end if;
  if not exists (select 1 from business b where b.id = p_business_id) then
    raise exception 'El negocio no existe';
  end if;

  -- Un negocio sin fila de suscripción (no debería pasar tras el backfill) se repara
  -- aquí: sin prueba vigente, para que el pago sea lo único que lo mantenga activo.
  insert into business_subscription (business_id, trial_ends_at)
  values (p_business_id, now())
  on conflict (business_id) do nothing;

  -- Bloquea la fila: dos pagos simultáneos del mismo negocio se serializan y el
  -- segundo valida contra el `paid_until` que dejó el primero.
  select s.paid_until into v_current
    from business_subscription s
   where s.business_id = p_business_id
     for update;

  if v_current is not null and p_paid_until <= v_current then
    raise exception 'La nueva fecha debe ser posterior a la actual (%): un pago no acorta la suscripción', v_current;
  end if;

  insert into subscription_payment (business_id, amount_cents, paid_until, method, note, recorded_by)
  values (p_business_id, p_amount_cents, p_paid_until, p_method, nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;

  update business_subscription
     set paid_until = p_paid_until,
         updated_at = now()
   where business_id = p_business_id;

  return v_id;
end; $$;

-- ── admin_set_exempt ────────────────────────────────────────────────────────
-- Pone o quita la exención y devuelve el estado resultante.
create or replace function admin_set_exempt(p_business_id bigint, p_exempt boolean)
returns text language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not is_platform_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_exempt is null then
    raise exception 'Falta indicar si el negocio queda exento';
  end if;
  if not exists (select 1 from business b where b.id = p_business_id) then
    raise exception 'El negocio no existe';
  end if;

  insert into business_subscription (business_id, trial_ends_at, exempt)
  values (p_business_id, now(), p_exempt)
  on conflict (business_id) do update
    set exempt     = excluded.exempt,
        updated_at = now();

  return subscription_status(p_business_id);
end; $$;

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke execute on function admin_list_businesses()                                          from public, anon;
revoke execute on function admin_register_payment(bigint, bigint, timestamptz, text, text) from public, anon;
revoke execute on function admin_set_exempt(bigint, boolean)                                from public, anon;
grant  execute on function admin_list_businesses()                                          to authenticated;
grant  execute on function admin_register_payment(bigint, bigint, timestamptz, text, text)  to authenticated;
grant  execute on function admin_set_exempt(bigint, boolean)                                to authenticated;

-- Endurecimiento: las funciones de estado ya no las llama nadie desde la API.
revoke execute on function subscription_status(bigint)  from authenticated;
revoke execute on function business_operational(bigint) from authenticated;
