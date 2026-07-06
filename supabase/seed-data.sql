-- Datos reales de Roelis para el negocio id = 1.
-- Correr UNA vez en el SQL Editor, DESPUÉS de schema.sql y bootstrap.sql.
-- Dinero en centavos (montos reales ×100). Reejecutable (on conflict do nothing).

-- Insumos globales (unit_cost = purchase_price / servings).
insert into supply (id, business_id, name, purchase_price, servings) values
  (1, 1002, 'Pigmento de cejas', 195000, 10),
  (2, 1002, 'Agujas', 120000, 20),
  (3, 1002, 'Anestesia', 195000, 20),
  (4, 1002, 'Anestesia TKTX', 90000, 15),
  (5, 1002, 'Guantes', 40000, 50),
  (6, 1002, 'Wipes', 8000, 40),
  (7, 1002, 'Cepillitos', 15000, 20),
  (8, 1002, 'Envases', 10000, 125),
  (9, 1002, 'Tinte', 60000, 45),
  (10, 1002, 'Gillette', 5000, 10),
  (11, 1002, 'Pestañas por grupito', 50000, 17),
  (12, 1002, 'Pestañas corridas', 4200, 1),
  (13, 1002, 'Pegamento', 22500, 7),
  (14, 1002, 'Espuma', 14000, 10),
  (15, 1002, 'Cera', 350000, 25),
  (16, 1002, 'Spray fijador', 30000, 15),
  (17, 1002, 'Base de maquillaje', 100000, 30),
  (18, 1002, 'Fijador', 80000, 50),
  (19, 1002, 'Pelo', 7500, 1)
on conflict (id) do nothing;

-- Servicios (supply_cost = suma de costos unitarios de sus insumos).
insert into service (id, business_id, name, price, supply_cost, cost_override, duration_min, variable_price) values
  (1, 1002, 'Micropigmentación de cejas', 600000, 43080, null, 120, false),
  (2, 1002, 'Micropigmentación de labios', 550000, 22830, null, 120, false),
  (3, 1002, 'Combo cejas + labios', 1000000, 43080, null, 240, false),
  (4, 1002, 'Maquillaje', 0, 6933, null, 120, true),
  (5, 1002, 'Trenzas', 0, 8900, null, 120, true),
  (6, 1002, 'Colas', 0, 7500, null, 60, true),
  (7, 1002, 'Ondas', 40000, 3400, null, 30, false),
  (8, 1002, 'Tintado', 40000, 2333, null, 10, false),
  (9, 1002, 'Cejas con gel', 20000, 14750, null, 15, false),
  (10,1002, 'Pestañas por grupito', 60000, 6355, null, 25, false),
  (11,1002, 'Pestañas corridas', 35000, 7414, null, 10, false)
on conflict (id) do nothing;

-- Enlaces servicio↔insumo (N↔N; wipes/pegamento/envases se comparten).
insert into service_supply (business_id, service_id, supply_id) values
  (1002, 1, 1), (1, 1, 2), (1, 1, 3), (1, 1, 4), (1, 1, 5), (1, 1, 6), (1, 1, 7), (1, 1, 8),
  (1002, 2, 2), (1, 2, 3), (1, 2, 4), (1, 2, 5), (1, 2, 6), (1, 2, 8),
  (1002, 3, 1), (1, 3, 2), (1, 3, 3), (1, 3, 4), (1, 3, 5), (1, 3, 6), (1, 3, 7), (1, 3, 8),
  (1002, 4, 17), (1, 4, 18), (1, 4, 16),
  (1002, 5, 19), (1, 5, 14),
  (1002, 6, 19),
  (1002, 7, 14), (1, 7, 16),
  (1002, 8, 9), (1, 8, 5), (1, 8, 6),
  (1002, 9, 15), (1, 9, 7),
  (1002, 10, 11), (1, 10, 13), (1, 10, 6),
  (1002, 11, 12), (1, 11, 13)
on conflict (service_id, supply_id) do nothing;

-- Gastos fijos mensuales (montos de ejemplo; ajústalos con Roelis).
insert into fixed_expense (id, business_id, concept, amount, period) values
  (1, 1002, 'Luz', 150000, 'MONTHLY'),
  (2, 1002, 'Agua', 50000, 'MONTHLY'),
  (3, 1002, 'Transporte', 200000, 'MONTHLY')
on conflict (id) do nothing;
