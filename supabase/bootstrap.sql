-- Arranque de datos (correr UNA vez, DESPUÉS de registrarte en la app con Auth).
-- Crea el negocio y enlaza tu usuario. Reemplaza el correo por el tuyo real.

-- 1) Crea el negocio con id 1 (si no existe). El id es explícito porque el
--    esquema usa ids provistos (no autogenerados).
insert into business (id, name, plan)
select 1, 'Citelis', 'mvp'
where not exists (select 1 from business where id = 1);

-- 2) Enlaza tu usuario autenticado con ese negocio.
insert into business_member (user_id, business_id)
select u.id, b.id
from auth.users u
cross join business b
where u.email = 'REEMPLAZA-CON-TU-CORREO@ejemplo.com'
  and b.name = 'Citelis'
on conflict do nothing;

-- (Opcional) Para añadir una ayudante después: registra su cuenta y repite el
-- paso 2 con su correo. Compartirán el mismo business_id.
