-- Añade a las citas el precio acordado y el abono/adelanto (aditivo, idempotente).
-- Correr una vez en el SQL Editor. No borra datos.
alter table appointment add column if not exists quoted_price bigint; -- precio acordado (opcional)
alter table appointment add column if not exists deposit bigint;      -- abono/adelanto (opcional)
