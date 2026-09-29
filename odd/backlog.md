# Pedidos pendientes, y cómo tocan lo que se está construyendo

Lista viva. No son tareas listas para hacer: son cosas pedidas cuyo diseño ya
condiciona decisiones que se están tomando ahora. Anotado el 2026-09-29.

---

## 1 · Combos de servicios (precio especial por combinación)

**Regla decidida por el usuario (2026-09-29)**: el combo aplica cuando la
combinación elegida **coincide con un combo ya guardado y configurado**.
Coincidencia exacta, no subconjunto. Es la forma más predecible: la dueña sabe
exactamente qué está ofreciendo y no aparecen descuentos por accidente.

Ejemplo suyo: micropigmentación 5.000 + labios 4.000, juntos 8.000.

Aplazado a propósito. Ver D4 en `multi-service-appointments.md`: el precio de un
conjunto se calcula en UN solo sitio, así que cuando entren los combos es el
único lugar que cambia.

### El apaño que ya existe en producción, y lo que revela

Una dueña (negocio 1005) ya resolvió esto a mano creando un **servicio falso**:

    name: "Zona intima + Media Pierna + Axilas"
    price: 230000        (RD$2.300)
    duration_min: 60
    supply_cost: 0       ← AQUÍ ESTÁ EL DAÑO
    variable_price: false

Funciona, pero le cuesta caro y probablemente no lo sabe: **`supply_cost: 0`**.
Al fusionar tres servicios en uno inventado pierde el costo de insumos de cada
uno, y con él la ganancia real. Su reporte de rentabilidad está mintiendo sobre
ese combo.

Eso es un argumento para los combos de verdad más fuerte que la comodidad: no es
que sea incómodo, es que **destruye datos de costo**.

Dos consecuencias para cuando lleguen:
- Esos servicios falsos tienen que **seguir funcionando para siempre**: hay citas
  históricas apuntando a ellos y su dinero está congelado (INVARIANTE 2).
- Conviene ofrecer convertirlos, no romperlos.

---

## 2 · Factura imprimible al cobrar, con el nombre del empleado

**Lo que ya está resuelto sin querer**: la decisión D1 de
`multi-service-appointments.md` congela, en cada fila de `appointment_service`,
su parte de `charged_price`, `actual_cost` y `profit` en el momento de cobrar.

Eso **es exactamente una línea de factura**. Se diseñó para los reportes y sirve
igual para imprimir. Micropigmentación 4.444 + labios 3.556 = 8.000.

**Lo que NO existe y hay que contemplar ahora**: el concepto de empleado. Hoy solo
hay `business_member(user_id, business_id)`, que son *usuarios que entran a la
app*. Una empleada que no usa la aplicación no existe en el modelo.

Y lo importante para el diseño de ahora: con varios servicios en una visita,
**cada servicio puede hacerlo una empleada distinta**. Las cejas una, las trenzas
otra. Así que el empleado cuelga de la **fila de `appointment_service`**, no de la
cita.

Si la tabla se diseña con esa forma, añadir la columna después es una columna
anulable. Si se diseña con el empleado en la cita, hay que rehacerla.

---

## 3 · Identificar el método de pago (efectivo, transferencia, tarjeta)

Para que la dueña vea en el reporte cuánto entró por cada vía.

Encaja donde se congela el dinero: junto a `charged_price`, al COMPLETAR.
Aditivo y sencillo en apariencia.

**La pregunta que hay que hacerle antes de construirlo**: ya existe `deposit`
(abono al reservar). Un caso real es *"me dio 1.000 en efectivo al reservar y el
resto por transferencia"*. Si eso pasa, un solo método por cita no alcanza y hace
falta una tabla de pagos. No inventar la respuesta: preguntar.

Y se cruza con la factura: el recibo tendría que decir cómo se pagó.

---

## 4 · Hora en formato de 12 horas

**Ya está hecho, casi del todo.** `formatTime` en `src/lib/format.ts` devuelve
`2:00 PM`, y lo usan 16 sitios.

El 24h se escapa por dos sitios concretos, los dos en
`src/components/owner/BookingSettings.tsx`, que muestran el dato crudo sin pasar
por el formateador:

- línea 100 — el horario de atención: `{hours.opens_at} – {hours.closes_at}`
  enseña `09:00 – 18:00`
- línea 155 — los bloqueos: `{block.starts_at.replace('T', ' ')}` enseña
  `2026-09-30 14:00`

Arreglarlo son dos sitios. Tarea pequeña y sin relación con lo demás.

**Límite honesto**: los selectores (`type="time"` y `type="datetime-local"`, seis
en total) los pinta el navegador según el idioma del sistema operativo. Si su
teléfono está en 24 horas, esos siguen en 24 horas y no hay forma razonable de
cambiarlo desde la aplicación. Eso se cambia en el teléfono, no aquí.

---

## 5 · Licenciamiento y planes por negocio (multitenant)

Planteado por el usuario el 2026-09-29. No se implementa ahora; se deja
contemplado para no tener que rehacer medio sistema cuando toque comercializar.

### La fuga, verificada

No es hipotética. Hoy:

- `create_business` está concedida a `authenticated`, sin más.
- Su única comprobación es `if auth.uid() is null then raise exception` — o sea,
  "¿estás logueado?". **Ni licencia, ni plan, ni cupo.**
- `business.plan` existe desde el baseline (`text not null default 'mvp'`) y
  **nadie la lee**: la única referencia en todo el código es la declaración del
  tipo en `types.ts:22`. La costura está puesta y muerta.

Conclusión: cualquiera que consiga iniciar sesión crea negocios sin límite. Si el
registro está abierto —hay que comprobarlo en la configuración de Supabase Auth,
que no se puede leer desde aquí—, basta con tener la URL.

### La mitigación barata, separable del sistema de planes

Poner una puerta en `create_business`: exigir algo para crear un negocio. El
proyecto **ya tiene la forma hecha** para unirse a un negocio existente
(`create_invitation` / `redeem_invitation`); crear uno pide lo mismo con otro
destino. Eso cierra la fuga sin construir facturación, y es mucho más pequeño
que el sistema de planes completo.

### Lo que hay que contemplar arquitectónicamente

1. **Un nombre de plan no alcanza.** Hace falta plan + estado de la suscripción +
   hasta cuándo es válida. "Premium" vencido no es Premium.

2. **La puerta va en la BASE DE DATOS, no en la interfaz.** Esconder un botón no
   impide una petición fabricada: las RPC públicas se pueden llamar directo. Este
   proyecto ya aprendió esta lección por las malas con el color que no se
   guardaba — un hueco de RLS falla EN SILENCIO. Lo mismo aplica aquí.

3. **Una sola función que responda "¿este negocio tiene derecho a esto?"**, igual
   que D4 hace con el precio. Si cada funcionalidad inventa su propia
   comprobación, meter planes después obliga a tocarlas todas.

   Esto aplica a lo que estamos construyendo AHORA: combos, factura y métodos de
   pago son exactamente el tipo de cosa que va a vivir en un plan superior.

### Lo que no se pudo comprobar

Si el registro de usuarios está abierto en Supabase Auth. Es lo que decide si la
fuga es teórica o está pasando. El MCP de Supabase está desconectado.
