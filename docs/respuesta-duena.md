# RESPUESTAS-DUEÑA.md — Datos reales del negocio (Citelis)

> **Cómo usar este archivo:** léelo junto a `PLAN.md`. Contiene las respuestas reales de la dueña (Roelis) sobre cómo funciona su negocio. Donde estas respuestas **contradicen o amplían** un supuesto del plan, se marca con ⚠️. Esos puntos deben resolverse **antes** de dar por cerrado el contrato de datos. La fecha de captura fue 2026-07-01.

---

## 1. SERVICIOS REALES Y PRECIOS

La dueña ofrece más servicios de los que el plan asumía (3). Lista real, con sus palabras:

| Servicio | Precio | Duración aprox. | Precio fijo o variable |
|---|---|---|---|
| Micropigmentación de cejas | 6000 (retoque 3500) | 2 h | Fijo (variable si hay oferta) |
| Micropigmentación de labios | 5500 (retoque 3500) | 2 h | Fijo (variable si hay oferta) |
| Maquillaje | variable | 2 h | **Variable** (según tipo de maquillaje) |
| Trenzas | variable | variable | **Variable** (según cantidad y tipo) |
| Colas | variable | — | **Variable** |
| Ondas | 400 | 30 min | Fijo |
| Tintado | 400 | 10 min | Fijo |
| Cejas con gel | 200 | — | Fijo |
| Pestañas por grupito | 600 | 25 min | Fijo |
| Pestañas corridas | 350 | 10 min | Fijo |

> Nota de la dueña: quiere poder registrar **ingresos extra** por servicios no completos o casos sueltos ("puedes poner ingresos extras por algún servicio no completo o etc.").

### ⚠️ Implicación de diseño 1 — Precio variable es un flujo principal, no una excepción
El plan trataba el override de precio como caso raro (para descuentos). La realidad: **trenzas, colas, maquillaje** casi siempre tienen precio variable, y micro puede variar por oferta. Recomendación: al agendar/completar estos servicios, el precio debe ser un **campo editable esperado**, no un override escondido. Considerar marcar cada servicio con una bandera `precio_variable: boolean` que, cuando es `true`, obliga a capturar el precio en la cita en vez de heredarlo del servicio.

---

## 2. COMBOS / PAQUETES

- **Sí ofrece combos.** Ejemplo dado: **Combo micro de cejas + labios = 10000** (vs. 6000 + 5500 = 11500 por separado).

### ⚠️ Implicación de diseño 2 — El modelo no soporta citas con varios servicios
El contrato de datos actual asume **1 cita → 1 servicio**. Un combo es varios servicios a un precio conjunto. Opciones:
- (a) Modelar el combo como un "servicio" propio con su propio precio y su propia lista de insumos (más simple, encaja en el modelo actual).
- (b) Permitir que una cita tenga varios `servicio_id` (más flexible, más complejo).
- Recomendación para MVP: **opción (a)** — un combo es un Servicio más. No romper el modelo por ahora.

---

## 3. INSUMOS (materiales) — datos crudos procesados

La dueña compra por frascos, paquetes, docenas. Ya piensa en "para cuántas clientas alcanza", que es exactamente el modelo "por tandas" del plan (`costo_unitario = precio_compra ÷ rendimiento`). Abajo, sus datos crudos convertidos a la estructura del sistema. **Nota:** algunos rendimientos venían ambiguos; marcados con `?` para confirmar con ella.

| Insumo | Precio compra | Rinde para (clientas) | Costo unitario (calc.) | Notas |
|---|---|---|---|---|
| Pigmento de cejas | 1950 c/u | ~20 (2 frascos → 20) | ~195 (si 2 frascos = 3900÷20) | Aclarar si 1950 rinde 10 o 2×1950 rinde 20 ⚠️ |
| Agujas | 1200 (paq. 20) | 20 | 60 | |
| Anestesia | 1950 | ~20 | ~97.5 | |
| Anestesia TKTX | 900 | ~15 | 60 | |
| Guantes | 400 (caja 100) | 50 | 8 | "100 x400 50" interpretado así |
| Wipes | 80 c/u (paquete) | ? | ? | Falta rendimiento ⚠️ |
| Cepillitos | 150 (x20) | 20 | 7.5 | |
| Envases | 100 (x125) | 125 | 0.8 | |
| Vitaminas | 300 | ~450 | ~0.67 | Rendimiento alto, confirmar unidad ⚠️ |
| Baberos | 100 | ~450 | ~0.22 | Confirmar ⚠️ |
| Tintado | 600 c/u | ~45 | ~13.3 | |
| Gillette | 50 | 10 | 5 | |
| Pestañas por grupito | 500 (paq. de 10) | ~17 | ~29.4 | |
| Pestañas corridas | 42 c/u | — | 42 | Parece costo por unidad directa |
| Pegamento | 225 | 7 | ~32.1 | |
| Pelo | 75 c/u | — | 75 | Confirmar rendimiento ⚠️ |
| Espuma | 140 c/u | ~10 | 14 | |
| Cera | 3500 | ~25 | 140 | |
| Spray fijador | 300 | ~15 | 20 | |
| Bases (distintas) | 1000 | ~30 | ~33.3 | |
| Fijador | 800 | ~50 | 16 | |

> Todos estos valores están en la moneda local de la dueña. El plan pide guardar dinero en **centavos enteros** internamente — convertir al importar (multiplicar × 100).

### ⚠️ Implicación de diseño 3 — Un insumo se comparte entre servicios
La dueña confirma que usa el **mismo material en varios servicios**: específicamente **wipes, pegamento y envases**. El contrato actual tiene `Insumo.servicio_id` (un insumo pertenece a UN servicio). Esto lo contradice. Opciones:
- (a) Duplicar el insumo por servicio (simple, pero editar el precio obliga a editar en varios lados → rompe la INVARIANTE 6 de "editar una vez recalcula").
- (b) Tabla `Insumo` global por negocio + tabla intermedia `ServicioInsumo` (servicio_id, insumo_id, cantidad/porción usada). Es el modelo correcto (relación N↔N).
- Recomendación: **opción (b)** aunque el MVP la implemente de forma mínima. Documentarlo ahora evita rehacer el cálculo de costos después.

---

## 4. GASTOS GENERALES (no ligados a un servicio)

- Otros gastos: **luz/agua, transporte**.
- **La dueña SÍ quiere que estos gastos se cuenten en su ganancia.**

### ⚠️ Implicación de diseño 4 — El modelo solo contempla costo de insumos por servicio
No hay lugar para gastos fijos del negocio (overhead). La ganancia "real" que ella pide incluye estos gastos. Opciones para el reporte:
- Añadir una entidad `GastoFijo` (negocio_id, concepto, monto, periodo) y restarla en el **reporte** (no en la ganancia por cita, porque no es atribuible a una cita concreta).
- Distinguir en el reporte: **ganancia bruta** (Σ ganancias de citas) vs. **ganancia neta** (bruta − gastos fijos del periodo). Esto responde exactamente a lo que ella pide ver.

---

## 5. OPERACIÓN Y AGENDA (confirma supuestos del plan)

| Tema | Respuesta de la dueña | Encaje con el plan |
|---|---|---|
| Cómo agenda hoy | Cuaderno/agenda, o de memoria | ✅ El sistema reemplaza esto; hay dolor real que resolver |
| Quién agenda | Ella misma | ✅ |
| Adelanto/depósito | A veces | ⚠️ No contemplado. Posible campo futuro `deposito` en Cita |
| Cancelaciones / no-show | A veces | ⚠️ El estado CANCELADA ya existe; considerar un estado NO_ASISTIÓ distinto para reportes |
| Atiende sin cita (al paso) | Sí | ⚠️ Debe poder crear una cita ya completada sobre la marcha (walk-in), no solo agendar a futuro |

---

## 6. PRECIOS, DESCUENTOS Y PAGOS

| Tema | Respuesta | Implicación |
|---|---|---|
| ¿Precio de lista o descuentos? | Siempre precio fijo | Refuerza que el override es para lo variable, no para descuentos habituales |
| ¿Cuándo hace descuento? | Solo si es un servicio nuevo que no suele hacer | Caso raro; el override manual cubre esto |
| Métodos de pago | Efectivo, transferencia | Posible campo `metodo_pago` en Cita (futuro) |
| ¿Cobra antes o después? | Después | Encaja con congelar valores al COMPLETAR ✅ |
| ¿Queda debiendo / paga en partes? | No | Simplifica: no hace falta modelar pagos parciales en MVP ✅ |

---

## 7. QUÉ QUIERE VER (define el reporte)

- Lo PRIMERO que quiere ver: **"cuánto gané en los servicios y qué más ganancias deja, para tenerlo claro."**
- Piensa su negocio **por día**.
- Le interesan **las dos cosas**: ingresos y ganancia.
- Con la info de cuánto ganó, **toma decisiones como subir el precio. Donde se esta gastando, cuales servicios son los que mas se venden y saber que mejoras hacer para el negocio.**

### Implicación de diseño 5 — Vista diaria primero
El plan pone el **reporte semanal** en la Fase 3, pero la dueña piensa **por día**. La pantalla de inicio (agenda del día con ganancia proyectada, ya en el plan) es lo que ella quiere ver primero. Recomendación: asegurar que el resumen **diario** de ganancia sea prominente desde el Slice 1; el semanal (Slice 3) es un complemento, no el foco.

---

## 8. CONTEXTO DE USO

| Tema | Respuesta | Implicación |
|---|---|---|
| ¿Desde dónde? | Celular, tablet | **Mobile-first obligatorio.** Diseñar para pantalla táctil pequeña primero |
| ¿Sola o con alguien? | Alguien más también | ⚠️ Habrá >1 usuario por negocio. Relevante para Fase 4 (auth): varios usuarios, mismo `negocio_id` |
| ¿Cuándo lo abriría? | Entre clientas | Refuerza el principio de "pocos toques": tiene segundos, no minutos |
| ¿Algo más? | "Por el momento todo está claro 🙏🏻" | Sin requisitos extra |

---

## 9. RESUMEN DE AJUSTES AL PLAN (checklist para el agente)

Antes de construir, resolver estos puntos que la realidad reveló:

- [ ] **Precio variable como flujo principal** (trenzas, colas, maquillaje, micro en oferta) — bandera `precio_variable` + captura en la cita.
- [ ] **Combos** — modelar como un Servicio propio en el MVP.
- [ ] **Insumos compartidos** entre servicios (wipes, pegamento, envases) — relación N↔N (`ServicioInsumo`), no `Insumo.servicio_id`.
- [ ] **Gastos fijos** (luz, agua, transporte) — entidad `GastoFijo` + distinguir ganancia bruta vs. neta en el reporte.
- [ ] **Walk-in** (atención al paso) — poder crear una cita ya completada sin agendar antes.
- [ ] **No-show** — considerar estado distinto de CANCELADA para reportes.
- [ ] **Vista diaria** de ganancia prominente desde el Slice 1 (ella piensa por día).
- [ ] **Mobile-first** — celular/tablet, uso "entre clientas".
- [ ] **Varios usuarios por negocio** — tenerlo en cuenta en el diseño de auth (Fase 4).
- [ ] **Confirmar con la dueña** los rendimientos marcados con ⚠️ en la tabla de insumos (§3).

> Estos ajustes NO invalidan el plan: lo afinan con datos reales. Las invariantes del plan (congelar al completar, filtrar por `negocio_id`, servicios ≠ productos) siguen intactas.