-- Fiado en ventas de ropa: cliente y monto pagado (aditivo, reejecutable).
-- Correr una vez en el SQL Editor. Las ventas existentes se asumen PAGADAS.
alter table sale add column if not exists client text not null default '';
alter table sale add column if not exists paid bigint; -- nullable primero, para backfill

-- Ventas ya existentes: se consideran pagadas por completo (eran de contado).
update sale set paid = unit_price * quantity where paid is null;

alter table sale alter column paid set default 0;
alter table sale alter column paid set not null;
