-- Aviso push a la dueña cuando una clienta pide cita desde el portal.
-- (odd/tasks/owner-push-notifications.md, T2)
--
-- EL PROBLEMA
--   `public_request_booking` crea la cita en REQUESTED y no avisa a nadie. La
--   dueña solo se entera si abre Citelis y recarga.
--
-- LA DECISIÓN
--   Web Push estándar hacia el iPhone de la dueña (Citelis instalado en la
--   pantalla de inicio). La base de datos solo GUARDA a qué dispositivos avisar
--   y DISPARA; quien compone y firma el mensaje es la Edge Function
--   `notify-new-booking`, porque la firma VAPID necesita la clave privada y esa
--   no debe vivir en la base.
--
-- POR QUÉ VAULT
--   La URL de la función y el secreto compartido cambian entre CitelisDev y
--   producción. Leerlos de Vault deja una sola migración para los dos entornos.
--   Se cargan UNA vez por entorno (ver docs/push-notifications.md).
--
-- LA REGLA QUE NO SE NEGOCIA
--   Una reserva nunca falla por culpa del aviso. `net.http_post` solo encola
--   (la llamada sale después, fuera de la transacción), y cualquier error del
--   disparador se degrada a WARNING.
--
-- ADITIVO: no borra ni una fila.

create extension if not exists pg_net;

-- ── A qué dispositivos avisar ──────────────────────────────────────────────
-- Una fila por navegador suscrito (`endpoint` es único por dispositivo). Lleva
-- `user_id` además de `business_id`: el aviso es de una persona concreta, y si
-- deja el negocio se van sus suscripciones con ella.
create table if not exists push_subscription (
  id          bigint generated always as identity primary key,
  business_id bigint not null references business(id) on delete cascade,
  user_id     uuid   not null references auth.users(id) on delete cascade,
  endpoint    text   not null unique,
  p256dh      text   not null,
  auth        text   not null,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscription_business_idx
  on push_subscription (business_id);

-- RLS: la dueña ve y borra SOLO las suyas, dentro de un negocio al que
-- pertenece. No hay policy de INSERT/UPDATE: se escribe por la función de abajo.
alter table push_subscription enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                  where tablename = 'push_subscription' and policyname = 'push_subscription_select') then
    create policy push_subscription_select on push_subscription for select
      using (user_id = auth.uid() and is_member(business_id));
  end if;
  if not exists (select 1 from pg_policies
                  where tablename = 'push_subscription' and policyname = 'push_subscription_delete') then
    create policy push_subscription_delete on push_subscription for delete
      using (user_id = auth.uid() and is_member(business_id));
  end if;
end $$;

-- ── Guardar la suscripción del dispositivo ─────────────────────────────────
-- Por función y no por INSERT directo por dos motivos: comprueba la membresía
-- con el negocio EXPLÍCITO (INVARIANTE 1), y un mismo navegador puede haber
-- quedado suscrito por otra persona (cambio de sesión en el iPhone). Un upsert
-- normal chocaría con la RLS de esa fila ajena; aquí se reemplaza.
create or replace function save_push_subscription(
  p_business_id bigint,
  p_endpoint    text,
  p_p256dh      text,
  p_auth        text
) returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not is_member(p_business_id) then
    raise exception 'No perteneces a este negocio';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' then
    raise exception 'Suscripción inválida';
  end if;

  delete from push_subscription where endpoint = p_endpoint;
  insert into push_subscription (business_id, user_id, endpoint, p256dh, auth)
  values (p_business_id, auth.uid(), p_endpoint, p_p256dh, p_auth);
end;
$$;

revoke execute on function save_push_subscription(bigint, text, text, text) from public;
grant  execute on function save_push_subscription(bigint, text, text, text) to authenticated;

-- ── El disparador ──────────────────────────────────────────────────────────
-- Solo manda el id: la función lee el resto con service role. Así no viajan
-- nombre ni teléfono de la clienta en la cola de pg_net.
create or replace function notify_new_booking()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notify_new_booking_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notify_new_booking_secret';

  -- Entorno sin configurar (o a medio configurar): no hay a quién llamar.
  if v_url is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object('appointment_id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', v_secret
    ),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  raise warning 'notify_new_booking: aviso no encolado para la cita %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke execute on function notify_new_booking() from public;

drop trigger if exists appointment_notify_new_booking on appointment;
create trigger appointment_notify_new_booking
  after insert on appointment
  for each row
  when (new.status = 'REQUESTED')
  execute function notify_new_booking();
