-- Datos reales de Roelis. Correr UNA vez en el SQL Editor, DESPUÉS de schema.sql
-- + onboarding (o bootstrap.sql). Toma tu business_id AUTOMÁTICAMENTE (asume un
-- solo negocio), así no hay que escribir el número a mano.
-- Dinero en centavos (montos reales ×100). Reejecutable (on conflict do nothing).

-- Insumos globales (unit_cost = purchase_price / servings).
insert into supply (id, business_id, name, purchase_price, servings)
select v.id, (select id from business order by id limit 1), v.name, v.pp, v.sv
from (values
  (1, 'Pigmento de cejas', 195000, 10),
  (2, 'Agujas', 120000, 20),
  (3, 'Anestesia', 195000, 20),
  (4, 'Anestesia TKTX', 90000, 15),
  (5, 'Guantes', 40000, 50),
  (6, 'Wipes', 8000, 40),
  (7, 'Cepillitos', 15000, 20),
  (8, 'Envases', 10000, 125),
  (9, 'Tinte', 60000, 45),
  (10, 'Gillette', 5000, 10),
  (11, 'Pestañas por grupito', 50000, 17),
  (12, 'Pestañas corridas', 4200, 1),
  (13, 'Pegamento', 22500, 7),
  (14, 'Espuma', 14000, 10),
  (15, 'Cera', 350000, 25),
  (16, 'Spray fijador', 30000, 15),
  (17, 'Base de maquillaje', 100000, 30),
  (18, 'Fijador', 80000, 50),
  (19, 'Pelo', 7500, 1)
) as v(id, name, pp, sv)
on conflict (id) do nothing;

-- Servicios (supply_cost = suma de costos unitarios de sus insumos).
insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price)
select v.id, (select id from business order by id limit 1), v.name, v.price, v.sc, null, v.dur, v.varp
from (values
  (1, 'Micropigmentación de cejas', 600000, 43080, 120, false),
  (2, 'Micropigmentación de labios', 550000, 22830, 120, false),
  (3, 'Combo cejas + labios', 1000000, 43080, 240, false),
  (4, 'Maquillaje', 0, 6933, 120, true),
  (5, 'Trenzas', 0, 8900, 120, true),
  (6, 'Colas', 0, 7500, 60, true),
  (7, 'Ondas', 40000, 3400, 30, false),
  (8, 'Tintado', 40000, 2333, 10, false),
  (9, 'Cejas con gel', 20000, 14750, 15, false),
  (10, 'Pestañas por grupito', 60000, 6355, 25, false),
  (11, 'Pestañas corridas', 35000, 7414, 10, false)
) as v(id, name, price, sc, dur, varp)
on conflict (id) do nothing;

-- Enlaces servicio↔insumo (N↔N; wipes/pegamento/envases se comparten).
insert into service_supply (business_id, service_id, supply_id)
select (select id from business order by id limit 1), v.service_id, v.supply_id
from (values
  (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7), (1, 8),
  (2, 2), (2, 3), (2, 4), (2, 5), (2, 6), (2, 8),
  (3, 1), (3, 2), (3, 3), (3, 4), (3, 5), (3, 6), (3, 7), (3, 8),
  (4, 17), (4, 18), (4, 16),
  (5, 19), (5, 14),
  (6, 19),
  (7, 14), (7, 16),
  (8, 9), (8, 5), (8, 6),
  (9, 15), (9, 7),
  (10, 11), (10, 13), (10, 6),
  (11, 12), (11, 13)
) as v(service_id, supply_id)
on conflict (service_id, supply_id) do nothing;

-- Gastos fijos mensuales (montos de ejemplo; ajústalos con Roelis).
insert into fixed_expense (id, business_id, concept, amount, period)
select v.id, (select id from business order by id limit 1), v.concept, v.amount, 'MONTHLY'
from (values
  (1, 'Luz', 150000),
  (2, 'Agua', 50000),
  (3, 'Transporte', 200000)
) as v(id, concept, amount)
on conflict (id) do nothing;
