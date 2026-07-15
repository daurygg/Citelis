-- Gastos fijos por mes (aditivo, reejecutable). Correr una vez en el SQL Editor.
-- Las filas existentes se asignan al mes actual.
alter table fixed_expense add column if not exists month text;
update fixed_expense set month = to_char(now(), 'YYYY-MM') where month is null;
alter table fixed_expense alter column month set not null;
