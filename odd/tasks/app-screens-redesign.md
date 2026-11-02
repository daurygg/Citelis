# Rediseño del resto de pantallas de la app

> Documento vivo de ODD. Espejo en Engram: `odd/app-screens-redesign/tasks`.
> Locator: `odd/tasks/app-screens-redesign.md`

## Objetivo

Terminar de llevar el lenguaje visual (portal público y agenda, ambos validados por la dueña)
a las pantallas que hoy solo heredan la base compartida, para que toda la app se sienta un
solo producto.

## Referencias

- `odd/tasks/public-booking-redesign.md` y `odd/tasks/owner-agenda-redesign.md`: tokens
  `paper/ink/muted/line`, fuente Bricolage global, `.display-name`, `ui.ts`, principios.
- taste-skill (uso moderado): `references/tells.md` y solo las secciones pertinentes de
  `references/app-screens.md` (ya usadas: §4.3, §4.4, §5, §7.1, §7.3, §7.5, §7.6, §12).

## Alcance autorizado (por partes, una a una)

- [x] **S1 Reservas** — `owner/RequestsInbox`, `owner/BookingSettings`.
- [x] **S2 Servicios** — `ServicesScreen`, `ServiceEditor`, `SupplyRow`, `AddSupplyForm`.
- [x] **S3 Créditos y cobro** — `ServiceCreditsScreen`, `PaymentPanel`.
- [x] **S4 Reportes** — `PeriodReport`, `FixedExpenses`, `ClothingReport`.
- [x] **S5 Ropa** — `SellForm`, `ProductsScreen`, `ProductRow`, `CreditsScreen`.
- [x] **S6 Mi negocio** — `owner/{BrandSettings,ReceiptSettings,PublicLinkSettings,EmployeeSettings,PushNotificationSettings}`, `BrandColorPicker`, `QrCode`.
- [x] **S7 Recibos y avisos** — `ReceiptDialog`, `ReceiptSheet`, `public/PublicReceipt`, `Toast`, `ClientNotice`, `SubscriptionNotice`, `BlockedScreen`, `CalendarActions` (sin romper la impresión térmica de 80 mm).
- [x] **S8 Administración** — `admin/{AdminPanel,AdminBusinessCard,PaymentForm}`.
- [x] **S9 Pestañas** — la barra de 5 pestañas de `App.tsx` corta una a 390 px; que quepan
  todas sin desplazamiento horizontal.

Fuera de alcance: `Login`, `Onboarding`, `LoadingScreen` (los reescribe
`feat/guided-onboarding`, aún sin fusionar), comportamiento, store, dominio, RPC.

## Restricciones

- Comportamiento idéntico. Sin cálculos de dinero en JSX (INVARIANTE 5).
- Servicios y ropa NO comparten componentes nuevos (INVARIANTE 3).
- En la UI nunca unidades técnicas (INVARIANTE 4).
- Mismo piso de calidad: 44 px, foco visible, sin mayúsculas sostenidas, sin "·" para unir
  metadatos, sin la misma sombra en todo, `prefers-reduced-motion`.

## Riesgo conocido

`feat/guided-onboarding` también cambia `App.tsx`, `DayAgenda.tsx` y `StoreContext.tsx`.
Al fusionar habrá conflictos con la agenda rediseñada; resolver a mano conservando la guía de
primeros pasos con el estilo nuevo.

## TDD

Modo: estricto. Runner: `npm run test:run`. Lógica pura nueva solo si hace falta, con test primero.

## Entrega

Rama `feat/app-screens-redesign`, apilada sobre `feat/owner-agenda-redesign`. Un commit por
parte. Escritor único y secuencial: S1–S4 primero, luego S5–S8.

## Checks

`npm run test:run`, `npm run typecheck`, `npm run build`, capturas a 390 px (marca clara y
oscura) de cada parte con Supabase simulado.

## Progreso

- Agenda validada por la dueña ("está todo bien"); "Cobró" se queda como está.
- Rama `feat/app-screens-redesign` creada desde `feat/owner-agenda-redesign`.
- S1 `2aafb31`, S2 `04bc146`, S3 `646ee8b`, S4 `83f6711`, ajustes `d4f326f`. `ui.ts` suma
  `screenTitle`, `surface`, `rowDivider`, `btnQuiet`, `btnQuietDanger`, `segmented`,
  `segment(active)`, `btnIcon` (sin quitar exports). Sin lógica pura nueva (sin RED/GREEN).
  taste-skill: `tells.md`, `app-screens.md` §5, §7.1–7.6, §8, §11. test:run 640/640,
  typecheck y build OK. Capturas `s1-`…`s4-` con Supabase simulado.
- Notas para S5–S8: reutilizar `surface`/`rowDivider`; `PaymentMethodChips` también vive en
  `ScheduleForm`; no romper `.receipt-*` de impresión; "Quitar" en horarios borra sin confirmar
  (comportamiento previo).
- S5 `953c5b5`, S6 `897b4ad`, S7 `4c8e481`, S8 `94a588a`, S9 `b36f5a7` + `d01e517`.
  Pestañas de igual ancho: caben a 360 y 390 px en ambos modos sin desplazarse.
  Impresión (S7): con `emulateMedia('print')` solo queda el recibo, negro sobre fondo
  transparente, 80 mm; verificado por estilos computados (no se renderizó el PDF).
  test:run 640/640, typecheck y build OK.

## Pendiente / abierto

- Deuda previa (INVARIANTE 5): `SellForm` calcula la ganancia en el componente
  (`(unitPrice - unitCost) * quantity`); antes estaba dentro del JSX, ahora en un `const`.
  Debería salir a `src/lib/domain/inventory`.
- `BrandColorPicker`: etiqueta algo desalineada (lo comparte Onboarding, fuera de alcance).
- Pestañas a 360 px quedan justas; textos nuevos no revisados por debajo de 360 px.
- Fusionar `feat/guided-onboarding` exigirá resolver conflictos en `App.tsx` y `DayAgenda.tsx`.
