-- Corrige el revoke incompleto de 20260918000003.
--
-- Allí se revocó `execute` de PUBLIC sobre create_business, create_invitation y
-- redeem_invitation, y se comprobó después que `anon` SEGUÍA pudiendo
-- ejecutarlas (`has_function_privilege('anon', ..., 'EXECUTE')` = true).
--
-- Motivo: en Supabase no basta con quitar el EXECUTE que Postgres da a PUBLIC.
-- El proyecto trae `alter default privileges in schema public grant all on
-- functions to anon, authenticated`, así que cada función nace además con una
-- concesión DIRECTA a esos dos roles. Revocar de PUBLIC no toca una concesión
-- directa: hay que revocar del rol por su nombre.
--
-- Las tres siguen defendiéndose solas con su `raise` sobre `auth.uid()`; esto es
-- defensa en profundidad, para que el permiso diga lo que de verdad queremos.
revoke execute on function create_business(text)   from anon;
revoke execute on function create_invitation()     from anon;
revoke execute on function redeem_invitation(text) from anon;

-- `is_member` se queda accesible para anon a propósito: las policies RLS la
-- evalúan como el usuario que consulta, así que revocarla convertiría "no ves
-- nada" en un error de permisos. No filtra nada: para un anónimo devuelve false.
