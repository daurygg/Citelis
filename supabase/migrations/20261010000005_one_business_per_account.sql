-- Una cuenta solo puede CREAR un negocio.
-- (odd/backlog.md §5, "Licenciamiento y planes por negocio")
--
-- LA REGLA (decidida por la dueña del producto, 2026-10-10)
--   "Una cuenta solo puede crear un solo negocio." Que te inviten a otro negocio
--   (`redeem_invitation` → `business_member`) NO es crear, y esta regla no lo toca:
--   una cuenta puede ser miembro de varios negocios, pero creadora de uno solo.
--
-- POR QUÉ EN LA BASE Y NO EN LA INTERFAZ
--   Esconder el botón no frena una petición fabricada a mano contra la RPC. La
--   puerta tiene que estar donde se decide: `create_business`, respaldada por un
--   índice único.
--
-- QUÉ HACE
--   1. `business.created_by`: quién creó el negocio. Hasta hoy no había rastro: la
--      membresía no distingue a la creadora de una invitada.
--   2. Backfill SOLO donde no hay ambigüedad (ver abajo).
--   3. Índice único parcial `business_created_by_unique`: la garantía real.
--   4. `create_business` rellena `created_by` y traduce la violación del índice a
--      un mensaje en lenguaje de la dueña.
--
-- ADITIVO: no borra ni cambia ninguna fila existente salvo rellenar la columna
-- nueva. Los negocios sin `created_by` (historia ambigua) quedan fuera de la regla.

alter table business
  add column if not exists created_by uuid references auth.users (id) on delete set null;

-- BACKFILL. Solo se afirma lo que se sabe: si un negocio tiene EXACTAMENTE un
-- miembro, ese miembro lo creó (nadie más pudo haber entrado: no hay invitación
-- sin creadora previa). Con dos o más miembros no se sabe quién fue la creadora
-- y no se inventa: queda NULL. Si una misma persona fuera la única miembro de
-- varios negocios, solo se marca el de menor id (row_number), para que el índice
-- único pueda crearse; los demás quedan NULL, también sin inventar.
with solitarios as (
  select m.business_id, m.user_id
    from business_member m
   where m.business_id in (select business_id from business_member
                            group by business_id having count(*) = 1)
),
ordenados as (
  select business_id, user_id,
         row_number() over (partition by user_id order by business_id) as pos
    from solitarios
)
update business b
   set created_by = o.user_id
  from ordenados o
 where o.business_id = b.id
   and o.pos = 1
   and b.created_by is null;

-- La garantía, a prueba de carreras: entre una comprobación previa y el insert
-- cabe otra petición de la misma cuenta; solo el índice responde con certeza.
-- Parcial: los NULL (historia ambigua, o creadora borrada) no cuentan.
create unique index if not exists business_created_by_unique
  on business (created_by) where created_by is not null;

-- Mismo cuerpo que 20260922000003; solo cambian las marcadas con "NUEVO".
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
  v_index   text;                                         -- NUEVO
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;

  -- NUEVO · Aviso temprano y amable, ANTES de gastar un número de la secuencia.
  -- No es la garantía (otra petición cabe entre esta lectura y el insert): la
  -- garantía es el índice, que se atrapa más abajo.
  if exists (select 1 from business where created_by = auth.uid()) then
    raise exception 'Tu cuenta ya creó un negocio. Cada cuenta puede crear uno solo.';
  end if;

  new_id := nextval('business_id_seq');
  begin
    insert into business (id, name, plan, created_by)
    values (new_id, p_name, 'mvp', auth.uid());           -- NUEVO: created_by
  exception when unique_violation then
    -- NUEVO · Solo se traduce el choque de ESTE índice; cualquier otra violación
    -- única (la clave primaria, por ejemplo) se propaga tal cual.
    get stacked diagnostics v_index = constraint_name;
    if v_index = 'business_created_by_unique' then
      raise exception 'Tu cuenta ya creó un negocio. Cada cuenta puede crear uno solo.';
    end if;
    raise;
  end;

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

-- Mismos grants que antes (ver 20260922000003): `create or replace` los conserva,
-- pero se restatan para que esta migración se lea completa por sí sola.
revoke execute on function create_business(text, text, text) from public;
revoke execute on function create_business(text, text, text) from anon;
grant  execute on function create_business(text, text, text) to authenticated;
