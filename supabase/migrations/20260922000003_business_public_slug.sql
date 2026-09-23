-- El enlace público nace con el negocio y lleva su nombre dentro.
-- (odd/tasks/public-link-identity.md, T2)
--
-- EL PROBLEMA
--   El slug se armaba en el cliente como `negocio-<id>`: un id de base de datos
--   disfrazado de dirección, justo lo que la dueña reparte por WhatsApp. Y la
--   fila de `booking_policy` no existía hasta que ella tocaba un ajuste, así que
--   un negocio recién creado no tenía enlace que enseñar.
--
-- EL REPARTO
--   `slugifyBusinessName` (src/lib/domain/slug.ts, con sus tests) decide lo
--   BONITO: quita acentos, baja a minúsculas, colapsa símbolos. Aquí se decide lo
--   ÚNICO, que es lo único que la base puede saber: `public_slug` es UNIQUE y dos
--   "Salón Rosa" existen de verdad.
--
--   El slug llega del cliente, así que NO se confía en él: se valida contra el
--   mismo contrato que `isValidSlug`, y si no cumple se cae a `negocio-<id>`,
--   que es único por construcción. Mismo criterio que `theme_color` en
--   20260922000001: un dato cosmético mal formado jamás tumba el alta.
--
-- ADITIVO: no borra ni una fila. Los negocios que ya existen conservan su slug
-- actual; esta migración solo cambia cómo nacen los nuevos. Renombrar uno vivo
-- mataría los enlaces que sus clientas ya guardaron, y esa es una decisión de la
-- dueña, no de una migración.

-- La sobrecarga obliga al drop, igual que en 20260922000001: `create_business(text, text)`
-- y `create_business(text, text, text default null)` convivirían, y la llamada de
-- dos argumentos quedaría AMBIGUA. Los grants no sobreviven al drop: se rehacen abajo.
drop function if exists create_business(text, text);

create or replace function create_business(
  p_name        text,
  p_theme_color text default null,
  p_slug        text default null
)
returns bigint language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  new_id    bigint;
  base_slug text;
  try_slug  text;
  attempt   integer := 1;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  new_id := nextval('business_id_seq');
  insert into business (id, name, plan) values (new_id, p_name, 'mvp');

  -- El color es cosmético: un hex ausente o mal formado NUNCA debe tumbar el
  -- alta. Si no matchea, la fila se queda con el default de la columna.
  if p_theme_color ~ '^#[0-9a-fA-F]{6}$' then
    update business set theme_color = p_theme_color where id = new_id;
  end if;

  -- Mismo contrato que `isValidSlug`: minúsculas, dígitos y guiones INTERIORES.
  if p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(p_slug) <= 40 then
    base_slug := p_slug;
  else
    base_slug := 'negocio-' || new_id;
  end if;

  -- Desempate. Se hace atrapando `unique_violation` y no con un `select exists`
  -- previo, porque entre la comprobación y el insert cabe otra alta: la única
  -- respuesta fiable sobre unicidad la da el índice, no una lectura anterior.
  try_slug := base_slug;
  loop
    begin
      insert into booking_policy (business_id, public_slug) values (new_id, try_slug);
      exit;
    exception when unique_violation then
      attempt := attempt + 1;
      -- Tras muchos choques se pasa al id, que es único por construcción. Lleva
      -- el intento pegado porque un negocio podría llamarse "Negocio 1001" y
      -- haber ocupado ya ese nombre: sin el sufijo, el bucle no terminaría.
      try_slug := case
        when attempt > 50 then 'negocio-' || new_id || '-' || attempt
        else base_slug || '-' || attempt
      end;
    end;
  end loop;

  insert into business_member (user_id, business_id) values (auth.uid(), new_id);
  return new_id;
end; $$;

-- Por default de esquema este proyecto concede EXECUTE a anon Y a authenticated
-- en cuanto la función nace (ver 20260918000004). `create_business` exige
-- `auth.uid()`: hay que revocar de anon por nombre, no de PUBLIC.
revoke execute on function create_business(text, text, text) from public;
revoke execute on function create_business(text, text, text) from anon;
grant  execute on function create_business(text, text, text) to authenticated;
