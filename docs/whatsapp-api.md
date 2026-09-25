# Avisar a la clienta por WhatsApp

Qué hace Citelis hoy, y qué hace falta el día que se quiera automatizar.
Investigado contra fuentes primarias el 2026-09-23. Lo que no se pudo verificar
está marcado como tal: si un dato no lleva fuente, es que no la tiene.

## Lo que hay hoy: el enlace `wa.me`

Cuando la dueña acepta o rechaza una solicitud, la bandeja le ofrece un enlace
que abre WhatsApp con el mensaje ya escrito. Ella pulsa enviar. Un toque.

Lo arma `src/lib/domain/whatsapp.ts` (puro, con tests):

```
https://wa.me/<país><número>?text=<mensaje codificado>
```

El número va en dígitos seguidos, sin `+`, sin `00`, sin espacios ni guiones, y
sin el cero inicial del número local. Para RD: `1829XXXXXXX`. El `text` tiene que
ir codificado o el mensaje se corta en el primer espacio.

**Qué no da**: no hay confirmación de entrega, y depende de que la dueña pulse.
Si no pulsa, la clienta no se entera. Ese es el motivo para querer automatizarlo.

*(El formato del enlace está corroborado por varias fuentes secundarias
independientes, pero no se pudo leer la página oficial de WhatsApp: el fetch la
devolvió truncada en dos intentos. El límite de caracteres del parámetro `text`
y qué pasa exactamente si el número no tiene WhatsApp quedan SIN verificar.)*

## Lo que hace falta para automatizarlo

### Corrección a lo que se creía

**La verificación de empresa de Meta NO es un requisito para empezar.** Un
portafolio de negocio recién creado ya puede mandar a **250 clientas distintas
cada 24 horas** sin verificar nada
([messaging-limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)).
Para un salón eso sobra de largo, probablemente para siempre. La verificación
solo hace falta para pasar de 250 a 2.000+.

Así que el trámite es bastante menos de lo que parecía. Lo que sí es real es lo
de abajo.

### Los tres frenos de verdad

**1. Hace falta un número dedicado.** Un número que esté activo en la app normal
de WhatsApp o en WhatsApp Business **no se puede registrar** en el Cloud API sin
borrarlo antes de ahí, y una vez registrado deja de funcionar en las apps de
consumidor
([phone-numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers)).
O sea: la dueña no puede usar su WhatsApp de siempre para las dos cosas. O
consigue una línea aparte para el API, o pierde el WhatsApp que ya usa. Para un
salón de una persona, esto es el obstáculo mayor, y no es técnico.

**2. Hace falta una plantilla aprobada.** Un mensaje que inicia el negocio fuera
de una ventana de conversación abierta exige plantilla. "Tu cita quedó
confirmada / no voy a poder atenderte" cae en la categoría **Utility**
(transaccional). Meterle cualquier frase promocional la reclasifica como
Marketing, que cuesta más y exige texto de baja. La aprobación suele ser
automática en 15–30 minutos, y hasta 24–48 h si algo se marca para revisión
manual — *ese tiempo viene de fuentes secundarias; Meta no publica un SLA que se
pudiera verificar*.

Motivos frecuentes de rechazo (secundarios, sin fuente primaria): categoría que
no corresponde al contenido, una variable justo al principio o al final del
mensaje, y textos demasiado genéricos.

**3. Se paga por mensaje entregado.** Desde el 1 de julio de 2025 Meta cobra
**por mensaje**, no por conversación: solo se cobra cuando se entrega un mensaje
de plantilla
([pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)).
Los mensajes libres dentro de una ventana abierta de 24 h son gratis, y las
plantillas Utility dentro de esa ventana también.

**La tarifa exacta para República Dominicana NO se pudo extraer.** La página
agrupa RD en un bucket regional de Latinoamérica pero el número no salió en el
fetch. Hay que mirar la tarifa en vivo antes de comprometerse. Además, esa misma
página señala cambios de tarifa con efecto **1 de octubre de 2026**, y las
fuentes no coinciden en el alcance: Meta lo describe como ajustes para una lista
concreta de países (ninguno de ellos RD), mientras que varios blogs lo describen
como algo más amplio. **Alcance sin verificar**: conviene volver a mirar la
página cerca de esa fecha.

Ya no hay bolsa mensual de conversaciones gratis: eso murió con el modelo viejo.

### Lo que NO hace falta

**Un webhook público no es necesario para enviar.** Enviar es un POST a la Graph
API y ya. El webhook solo hace falta para *recibir*: respuestas de la clienta, o
avisos de entregado/leído
([webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/)).
Para "aviso y me olvido", no se necesita.

## Pasos para implementarlo

1. Conseguir la línea telefónica dedicada. Es lo primero porque es lo que más
   tarda en la vida real, y condiciona todo lo demás.
2. Crear el portafolio de negocio y una app de tipo negocio en
   developers.facebook.com, y con ella una WhatsApp Business Account (WABA).
   ([about-the-platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform))
3. Probar con el número de prueba que Meta provisiona solo: sirve para integrar,
   pero solo alcanza a 5 destinatarios añadidos a mano.
4. Registrar el número real (verificación por SMS o llamada).
5. Redactar y mandar a aprobar **dos** plantillas Utility, una de confirmación y
   otra de rechazo, con variables para nombre, servicio, fecha y hora.
6. Guardar el token de acceso **en el servidor**. Citelis es una SPA de Vite: todo
   lo que entra por `VITE_*` acaba dentro del bundle y queda a la vista de
   cualquiera. El envío tiene que salir de una función en el borde o de una Edge
   Function de Supabase, nunca del navegador.
7. Llamar a esa función desde `acceptRequest` y `rejectRequest`, y **dejar el
   botón `wa.me` como respaldo** para cuando el envío falle o la plantilla esté
   en revisión.

## La alternativa: Twilio

Twilio se apoya en la misma infraestructura de Meta, así que **no quita** la WABA,
ni las plantillas, ni las reglas. Lo que aporta es un
[sandbox gratis](https://www.twilio.com/docs/whatsapp/sandbox) para desarrollo
(se entra mandando `join <código>` al +1 415 523 8886; solo llega a números que
se hayan unido; 1 mensaje cada 3 segundos; la sesión caduca a los 3 días) y una
sola factura.

Cobra **0,005 USD por mensaje** encima de la tarifa de Meta, que su página sitúa
desde **0,0034 USD** para Utility fuera de ventana
([pricing](https://www.twilio.com/en-us/whatsapp/pricing)). *Esa misma página
afirma que las plantillas de Marketing no llevan tarifa de Meta, lo cual
contradice el modelo por categorías: dato sospechoso, verificar en vivo.*

## SMS como respaldo: sale caro

Twilio cobra **0,1308 USD por SMS** en RD
([pricing DO](https://www.twilio.com/en-us/sms/pricing/do)) — unas 25 veces el
WhatsApp. Y hay trabas locales
([guidelines DO](https://www.twilio.com/en-us/guidelines/do/sms)): los remitentes
alfanuméricos no son fiables y las operadoras los sustituyen por un shortcode al
azar; los números locales no sirven para enviar; un shortcode propio tarda unas 4
semanas. No hay registro tipo A2P 10DLC, que es cosa de Estados Unidos.

Conclusión: SMS solo tiene sentido para una clienta sin WhatsApp, y en RD eso es
raro.

## Lo que quedó sin verificar

- La tarifa numérica de Meta para RD.
- El alcance real del cambio de precios del 1 de octubre de 2026.
- Que las plantillas de Marketing no lleven tarifa de Meta (afirmado por Twilio).
- El texto oficial de WhatsApp sobre el formato de `wa.me`.
- El límite de caracteres del parámetro `text` y qué pasa si el número no tiene
  WhatsApp.
