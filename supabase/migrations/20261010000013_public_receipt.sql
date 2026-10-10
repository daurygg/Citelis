-- Recibo digital público (P6 de odd/tasks/payments-and-receipt.md).
--
-- POR QUÉ EL TOKEN Y NO EL NÚMERO: el número del recibo es secuencial (V-000014 →
--   V-000015), así que cualquiera podría recorrerlos y leer los recibos de otras
--   clientas. `receipt.public_token` es un uuid aleatorio (gen_random_uuid, 122 bits):
--   no se puede adivinar ni enumerar. Quien tiene el enlace (el QR impreso) puede ver
--   ESE recibo y ningún otro; sin el enlace no hay forma de llegar a él.
--
-- QUÉ SE EXPONE: solo lo que el papel ya muestra. NUNCA costos, ganancia, teléfono de
--   la clienta, ids internos ni otras citas. La función es la ÚNICA puerta: `receipt`
--   sigue con RLS por membresía, así que anon no puede leer la tabla directamente.
--
-- TOKEN DESCONOCIDO → null (no un error): el visitante no aprende nada más que "no hay
--   recibo con ese enlace".
--
-- SECURITY DEFINER porque anon no tiene acceso a las tablas; `search_path` fijo para
--   que nadie secuestre nombres. ADITIVA: solo una función nueva.

create or replace function public_receipt(p_token uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'business', jsonb_build_object(
      'name',      b.name,
      'address',   b.address,
      'phone',     b.phone,
      'logo_path', b.logo_path
    ),
    'receipt', jsonb_build_object('number', r.number, 'issued_at', r.issued_at),
    'appointment', jsonb_build_object('datetime', a.datetime, 'client', a.client),
    -- Nulo si quien cobró no se puso nombre: el cliente muestra el del negocio.
    'cashier', (
      select nullif(btrim(m.display_name), '')
        from business_member m
       where m.business_id = a.business_id and m.user_id = a.charged_by
    ),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'service_name',  sv.name,
               'employee_name', e.name,
               'list_price',    s.list_price,
               'discount',      s.discount,
               'charged_price', s.charged_price
             ) order by s.service_id)
        from appointment_service s
        join service sv on sv.id = s.service_id and sv.business_id = s.business_id
        left join employee e on e.id = s.employee_id and e.business_id = s.business_id
       where s.appointment_id = a.id and s.business_id = a.business_id
    ), '[]'::jsonb),
    'total', a.charged_price,
    -- Sumado por vía; method nulo = abonos históricos sin vía registrada.
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('method', x.method, 'amount', x.amount) order by x.method nulls last)
        from (
          select p.method, sum(p.amount)::bigint as amount
            from appointment_payment p
           where p.appointment_id = a.id and p.business_id = a.business_id
           group by p.method
        ) x
    ), '[]'::jsonb),
    'credit', greatest(0, a.charged_price - coalesce((
      select sum(p.amount) from appointment_payment p
       where p.appointment_id = a.id and p.business_id = a.business_id
    ), 0))
  )
  from receipt r
  join appointment a on a.id = r.appointment_id and a.business_id = r.business_id
  join business b on b.id = r.business_id
  where r.public_token = p_token;
$$;

revoke execute on function public_receipt(uuid) from public;
grant  execute on function public_receipt(uuid) to anon, authenticated;
