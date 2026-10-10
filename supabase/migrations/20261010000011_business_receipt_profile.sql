-- Datos del recibo (P4 de odd/tasks/payments-and-receipt.md).
--
-- EL RECIBO NECESITA
--   · Encabezado del negocio: logo, nombre (ya existe), dirección y teléfono.
--   · "Cajero": el nombre visible de quien cobró.
--
-- ESCRITURA DE LOS DATOS DEL NEGOCIO
--   `business` ya tiene la policy `business_update` (is_member) y el grant de UPDATE
--   por COLUMNA (20260922000002). Aquí solo se AÑADEN al grant las tres columnas
--   nuevas; `name` y `plan` siguen fuera (la dueña no se cambia el plan).
--
-- NOMBRE DEL CAJERO
--   `business_member.display_name`. Cada miembro fija SOLO el suyo, por la RPC
--   `set_my_display_name` (sin policy de UPDATE en la tabla: no se ensancha nada).
--   `member_select` solo deja ver la fila propia, así que los nombres de las demás
--   miembros se leen por `business_member_names`, acotada a su propio negocio.
--
-- LOGO
--   Bucket público `business-logos` (el recibo digital de P6 es público). Cualquiera
--   LEE; solo los miembros del negocio X escriben bajo la carpeta `<X>/`.
--   `storage.objects` lo crea la imagen de Postgres de Supabase (y el stack local);
--   si el esquema `storage` no existiera, esa parte se omite con un aviso.
--
-- QUIÉN COBRÓ
--   `appointment.charged_by` (auth.uid() al completar). `complete_appointment` se
--   recrea con el texto de 20261010000010 y UN solo cambio: esa columna en el UPDATE.
--
-- ADITIVA: columnas nulas nuevas, sin tocar filas existentes.

alter table business
  add column if not exists address   text,
  add column if not exists phone     text,
  add column if not exists logo_path text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'business_address_len') then
    alter table business add constraint business_address_len check (char_length(address) <= 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'business_phone_len') then
    alter table business add constraint business_phone_len check (char_length(phone) <= 40);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'business_logo_path_len') then
    alter table business add constraint business_logo_path_len check (char_length(logo_path) <= 300);
  end if;
end $$;

-- Grant por columna: se suman las nuevas a `theme_color`. Nada más se ensancha.
grant update (address, phone, logo_path) on business to authenticated;

-- ── Nombre visible de quien cobra ──────────────────────────────────────────
alter table business_member add column if not exists display_name text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'business_member_display_name_len') then
    alter table business_member
      add constraint business_member_display_name_len check (char_length(display_name) <= 60);
  end if;
end $$;

-- Fija el nombre de la miembro que llama, solo en su propia fila. Vacío lo borra.
create or replace function set_my_display_name(p_business_id bigint, p_name text)
returns text language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_rows integer;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not is_member(p_business_id) then raise exception 'Ese negocio no es tuyo.'; end if;
  if v_name is not null and char_length(v_name) > 60 then
    raise exception 'El nombre es demasiado largo (máximo 60 letras).';
  end if;

  update business_member
     set display_name = v_name
   where business_id = p_business_id and user_id = auth.uid();
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'Ese negocio no es tuyo.'; end if;
  return v_name;
end $$;

revoke execute on function set_my_display_name(bigint, text) from public;
revoke execute on function set_my_display_name(bigint, text) from anon;
grant  execute on function set_my_display_name(bigint, text) to authenticated;

-- Nombres de las miembros de MI negocio (para mostrar quién cobró). Solo devuelve
-- user_id y display_name, nunca correos; y solo si quien llama es miembro (INVARIANTE 1).
create or replace function business_member_names(p_business_id bigint)
returns table (user_id uuid, display_name text) language plpgsql stable security definer
set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not is_member(p_business_id) then raise exception 'Ese negocio no es tuyo.'; end if;
  return query
    select m.user_id, m.display_name
      from business_member m
     where m.business_id = p_business_id;
end $$;

revoke execute on function business_member_names(bigint) from public;
revoke execute on function business_member_names(bigint) from anon;
grant  execute on function business_member_names(bigint) to authenticated;

-- ── Quién cobró ────────────────────────────────────────────────────────────
-- Si la usuaria se borra, la cita conserva su historia: solo se pierde el vínculo.
alter table appointment
  add column if not exists charged_by uuid references auth.users (id) on delete set null;

-- ── Logo: bucket y policies ────────────────────────────────────────────────
-- Id del negocio dueño de una carpeta `<business_id>/...`; null si el primer
-- segmento no es un número (así el cast nunca lanza).
create or replace function logo_folder_business_id(p_name text)
returns bigint language sql immutable
set search_path = public, pg_temp as $$
  select case when (string_to_array(p_name, '/'))[1] ~ '^[0-9]{1,15}$'
              and array_length(string_to_array(p_name, '/'), 1) > 1
              then ((string_to_array(p_name, '/'))[1])::bigint end;
$$;

do $$
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice 'Esquema storage ausente: se omite el bucket business-logos y sus policies.';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('business-logos', 'business-logos', true)
  on conflict (id) do nothing;

  -- Límites del bucket (500 KB, png/jpeg/webp) si esta versión de Storage los tiene.
  if exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit')
     and exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    update storage.buckets
       set file_size_limit = 512000,
           allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
     where id = 'business-logos';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'business_logos_read') then
    create policy business_logos_read on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'business-logos');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'business_logos_insert') then
    create policy business_logos_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'business-logos' and is_member(logo_folder_business_id(name)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'business_logos_update') then
    create policy business_logos_update on storage.objects
      for update to authenticated
      using (bucket_id = 'business-logos' and is_member(logo_folder_business_id(name)))
      with check (bucket_id = 'business-logos' and is_member(logo_folder_business_id(name)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'business_logos_delete') then
    create policy business_logos_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'business-logos' and is_member(logo_folder_business_id(name)));
  end if;
end $$;

-- ── Cobrar. Texto de 20261010000010; SOLO cambia `charged_by = auth.uid()`. ──
create or replace function complete_appointment(
  p_business_id    bigint,
  p_appointment_id bigint,
  p_charged_price  bigint,
  p_actual_cost    bigint,
  p_profit         bigint,
  p_lines          jsonb,
  p_payments       jsonb default '[]'
)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_apt      appointment%rowtype;
  v_expected bigint[];
  v_given    bigint[];
  v_n        integer;
  v_distinct integer;
  v_nulls    integer;
  v_sum_chg  bigint;
  v_sum_cost bigint;
  v_sum_prof bigint;
  v_foreign  integer;
  v_bad_emp  integer;
  v_paid_old bigint;
  v_paid_new bigint;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not is_member(p_business_id) then raise exception 'Ese negocio no es tuyo.'; end if;

  -- Bloqueo de fila: dos cobros a la vez de la misma cita se serializan, y el
  -- segundo ve ya el estado COMPLETED y se rechaza.
  select * into v_apt
    from appointment
   where id = p_appointment_id and business_id = p_business_id
     for update;
  if not found then raise exception 'Esa cita no existe en tu negocio.'; end if;

  if v_apt.status not in ('PENDING', 'IN_PROGRESS') then
    raise exception 'La cita % está en estado % y no se puede completar.', p_appointment_id, v_apt.status;
  end if;

  if p_charged_price is null or p_actual_cost is null or p_profit is null
     or p_charged_price < 0 or p_actual_cost < 0 then
    raise exception 'Los montos del cobro no son válidos.';
  end if;
  if p_profit <> p_charged_price - p_actual_cost then
    raise exception 'La ganancia no es precio menos costo.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Faltan las líneas de servicio de la cita.';
  end if;

  select count(*), count(distinct service_id),
         count(*) filter (where service_id is null or charged_price is null
                             or actual_cost is null or profit is null
                             or charged_price < 0 or actual_cost < 0),
         sum(charged_price), sum(actual_cost), sum(profit)
    into v_n, v_distinct, v_nulls, v_sum_chg, v_sum_cost, v_sum_prof
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint);

  if v_nulls > 0 then raise exception 'Hay líneas con montos incompletos o inválidos.'; end if;
  if v_n <> v_distinct then raise exception 'Un servicio aparece repetido en las líneas.'; end if;

  if exists (
    select 1 from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
     where l.profit <> l.charged_price - l.actual_cost
  ) then
    raise exception 'La ganancia de una línea no es precio menos costo.';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
     where coalesce(l.discount, 0) < 0
        or coalesce(l.list_price, l.charged_price) < 0
        or coalesce(l.discount, 0) > coalesce(l.list_price, l.charged_price)
  ) then
    raise exception 'Hay líneas con un descuento inválido.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
     where l.charged_price <> coalesce(l.list_price, l.charged_price) - coalesce(l.discount, 0)
  ) then
    raise exception 'El precio de una línea no es precio de lista menos descuento.';
  end if;

  if v_sum_chg <> p_charged_price or v_sum_cost <> p_actual_cost or v_sum_prof <> p_profit then
    raise exception 'Las líneas no suman el total de la cita.';
  end if;

  select array_agg(service_id order by service_id) into v_expected
    from appointment_service
   where appointment_id = p_appointment_id and business_id = p_business_id;
  if v_expected is null then
    v_expected := array[v_apt.service_id];
  end if;
  select array_agg(l.service_id order by l.service_id) into v_given
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint);
  if v_expected is distinct from v_given then
    raise exception 'Los servicios de las líneas no son los de la cita.';
  end if;

  select count(*) into v_foreign
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
    left join service s on s.id = l.service_id and s.business_id = p_business_id
   where s.id is null;
  if v_foreign > 0 then raise exception 'Un servicio no pertenece a tu negocio.'; end if;

  select count(*) into v_bad_emp
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
    left join employee e on e.id = l.employee_id and e.business_id = p_business_id
   where l.employee_id is not null and e.id is null;
  if v_bad_emp > 0 then raise exception 'Una empleada no pertenece a tu negocio.'; end if;
  select count(*) into v_bad_emp
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
    join employee e on e.id = l.employee_id and e.business_id = p_business_id
   where not e.active;
  if v_bad_emp > 0 then raise exception 'Una empleada está dada de baja y no se puede asignar.'; end if;

  -- Pagos (P3). Sin pagos, todo el cobro queda a crédito. Cada pago tiene monto
  -- positivo y una vía válida; los pagos nuevos más lo ya abonado no pueden pasar
  -- de lo cobrado. Que quede saldo pendiente SÍ se permite: es el crédito.
  if p_payments is null then p_payments := '[]'::jsonb; end if;
  if jsonb_typeof(p_payments) <> 'array' then
    raise exception 'Los pagos no tienen un formato válido.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_payments) as p(amount bigint, method text)
     where p.amount is null or p.amount <= 0
  ) then
    raise exception 'El pago debe ser mayor que cero.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_payments) as p(amount bigint, method text)
     where p.method is null or p.method not in ('cash', 'transfer', 'card')
  ) then
    raise exception 'La vía de pago no es válida.';
  end if;
  select coalesce(sum(amount), 0) into v_paid_new
    from jsonb_to_recordset(p_payments) as p(amount bigint, method text);
  select coalesce(sum(amount), 0) into v_paid_old
    from appointment_payment
   where appointment_id = p_appointment_id and business_id = p_business_id;
  if v_paid_new > 0 and v_paid_old + v_paid_new > p_charged_price then
    raise exception 'Los pagos suman más de lo que se cobró.';
  end if;

  update appointment
     set status = 'COMPLETED',
         charged_price = p_charged_price,
         actual_cost = p_actual_cost,
         profit = p_profit,
         charged_by = auth.uid()
   where id = p_appointment_id and business_id = p_business_id;

  insert into appointment_service (appointment_id, service_id, business_id,
                                   charged_price, actual_cost, profit, employee_id,
                                   list_price, discount)
  select p_appointment_id, l.service_id, p_business_id,
         l.charged_price, l.actual_cost, l.profit, l.employee_id,
         coalesce(l.list_price, l.charged_price), coalesce(l.discount, 0)
    from jsonb_to_recordset(p_lines)
      as l(service_id bigint, charged_price bigint, actual_cost bigint, profit bigint, employee_id bigint, list_price bigint, discount bigint)
  on conflict (appointment_id, service_id) do update
    set charged_price = excluded.charged_price,
        actual_cost   = excluded.actual_cost,
        profit        = excluded.profit,
        employee_id   = excluded.employee_id,
        list_price    = excluded.list_price,
        discount      = excluded.discount;

  insert into appointment_payment (business_id, appointment_id, amount, method, kind)
  select p_business_id, p_appointment_id, p.amount, p.method, 'charge'
    from jsonb_to_recordset(p_payments) as p(amount bigint, method text);

end $$;

revoke execute on function complete_appointment(bigint, bigint, bigint, bigint, bigint, jsonb, jsonb) from public;
revoke execute on function complete_appointment(bigint, bigint, bigint, bigint, bigint, jsonb, jsonb) from anon;
grant  execute on function complete_appointment(bigint, bigint, bigint, bigint, bigint, jsonb, jsonb) to authenticated;

revoke execute on function complete_appointment(bigint, bigint, bigint, bigint, bigint, jsonb, jsonb) from public;
revoke execute on function complete_appointment(bigint, bigint, bigint, bigint, bigint, jsonb, jsonb) from anon;
grant  execute on function complete_appointment(bigint, bigint, bigint, bigint, bigint, jsonb, jsonb) to authenticated;
