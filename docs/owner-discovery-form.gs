/**
 * Genera automáticamente el Google Form de descubrimiento para la dueña.
 *
 * CÓMO USARLO (sin instalar nada):
 *   1. Entra a https://script.google.com  →  "Nuevo proyecto".
 *   2. Borra el código de ejemplo y pega TODO este archivo.
 *   3. Arriba, elige la función "createCitelisForm" y pulsa "Ejecutar".
 *   4. Google te pedirá autorizar el acceso a tus Formularios → acepta.
 *   5. Al terminar, abre "Registro de ejecución" (Ver → Registros): ahí salen
 *      el enlace para EDITAR el formulario y el enlace para COMPARTIRLO con ella.
 *
 * El formulario queda guardado en tu Google Drive.
 */
function createCitelisForm() {
  var form = FormApp.create('Cómo funciona mi negocio — Citelis');
  form.setDescription(
    'Estas preguntas son para entender cómo trabajas hoy y construir el sistema a tu medida.\n' +
      'No hay respuestas correctas ni incorrectas: responde con tus propias palabras.\n' +
      'Si una pregunta no aplica a tu negocio, déjala en blanco.',
  );
  form.setProgressBar(true);

  // ───────────────────────── 1. Mis servicios ─────────────────────────
  form.addPageBreakItem().setTitle('1. Mis servicios');

  form
    .addParagraphTextItem()
    .setTitle('¿Qué servicios ofreces? Escríbelos como los llamas tú, uno por línea.')
    .setHelpText('Ejemplo: Micropigmentación de cejas / Trenzas / Pestañas');

  form
    .addParagraphTextItem()
    .setTitle('¿Cuánto cobras por cada servicio?')
    .setHelpText('Ejemplo: Cejas 3500, Pestañas 1200, Trenzas 2000');

  form
    .addParagraphTextItem()
    .setTitle('¿Cuánto tiempo te toma cada servicio, más o menos?')
    .setHelpText('Ejemplo: Cejas 2 horas, Trenzas 1 hora y media');

  form
    .addMultipleChoiceItem()
    .setTitle('¿El precio de tus servicios es siempre fijo, o a veces cambia?')
    .setChoiceValues(['Siempre es fijo', 'A veces cambia']);

  form
    .addParagraphTextItem()
    .setTitle('Si el precio a veces cambia, ¿de qué depende?')
    .setHelpText('Déjalo en blanco si tu precio siempre es fijo.');

  form
    .addMultipleChoiceItem()
    .setTitle('¿Ofreces combos o paquetes (varios servicios juntos a un precio especial)?')
    .setChoiceValues(['Sí', 'No']);

  form
    .addParagraphTextItem()
    .setTitle('Si tienes combos o paquetes, ¿cuáles son y a qué precio?');

  // ──────────────────── 2. Mis materiales y costos ────────────────────
  form.addPageBreakItem().setTitle('2. Mis materiales y costos');

  form
    .addParagraphTextItem()
    .setTitle('Cuando compras tus materiales, ¿cómo los compras?')
    .setHelpText('Ejemplo: el pigmento por frasco, las agujas por caja, el cabello por paquete');

  form
    .addMultipleChoiceItem()
    .setTitle('¿Sabes para cuántas clientas te alcanza cada material que compras?')
    .setChoiceValues(['Sí, lo sé bien', 'Más o menos', 'No lo sé']);

  form
    .addParagraphTextItem()
    .setTitle('Escribe tus materiales principales: cuánto pagaste y para cuántas clientas alcanza.')
    .setHelpText('Ejemplo: Pigmento: pagué 1200, alcanza 20 clientas. Agujas: pagué 800, alcanza 16.');

  form
    .addMultipleChoiceItem()
    .setTitle('¿Usas el mismo material en varios servicios distintos?')
    .setChoiceValues(['Sí', 'No']);

  form.addParagraphTextItem().setTitle('Si usas un material en varios servicios, ¿cuáles?');

  form
    .addCheckboxItem()
    .setTitle('Además de los materiales, ¿qué otros gastos tienes para trabajar?')
    .setChoiceValues(['Renta del local', 'Luz / agua', 'Transporte', 'Pago a un ayudante', 'Comisiones', 'Otro'])
    .showOtherOption(true);

  form
    .addMultipleChoiceItem()
    .setTitle('¿Quieres que esos otros gastos se cuenten en tu ganancia?')
    .setChoiceValues(['Sí', 'No', 'No estoy segura']);

  // ─────────────────────── 3. Cómo agendo ───────────────────────
  form.addPageBreakItem().setTitle('3. Cómo agendo mis citas');

  form
    .addCheckboxItem()
    .setTitle('¿Cómo apuntas tus citas hoy?')
    .setChoiceValues(['Por WhatsApp', 'En un cuaderno o agenda', 'Me las acuerdo', 'En otra app', 'Otro'])
    .showOtherOption(true);

  form
    .addMultipleChoiceItem()
    .setTitle('¿Quién agenda las citas?')
    .setChoiceValues(['Yo misma', 'Una recepcionista o ayudante', 'La clienta sola', 'Varias de las anteriores']);

  form
    .addMultipleChoiceItem()
    .setTitle('¿Pides un adelanto o depósito para apartar la cita?')
    .setChoiceValues(['Sí, siempre', 'A veces', 'No']);

  form
    .addMultipleChoiceItem()
    .setTitle('¿Cada cuánto se te cancela una cita o la clienta no llega?')
    .setChoiceValues(['Casi nunca', 'A veces', 'Seguido']);

  form
    .addMultipleChoiceItem()
    .setTitle('¿Atiendes también sin cita (al paso)?')
    .setChoiceValues(['Sí', 'No', 'A veces']);

  // ─────────────────────── 4. Cómo cobro ───────────────────────
  form.addPageBreakItem().setTitle('4. Cómo cobro');

  form
    .addMultipleChoiceItem()
    .setTitle('¿Cobras siempre el precio de lista o haces descuentos?')
    .setChoiceValues(['Siempre el precio fijo', 'Hago descuentos a veces']);

  form.addParagraphTextItem().setTitle('Si haces descuentos, ¿en qué casos?');

  form
    .addCheckboxItem()
    .setTitle('¿Cómo te pagan normalmente?')
    .setChoiceValues(['Efectivo', 'Transferencia', 'Tarjeta', 'Otro'])
    .showOtherOption(true);

  form
    .addMultipleChoiceItem()
    .setTitle('¿Cobras antes o después del servicio?')
    .setChoiceValues(['Antes', 'Después', 'Depende']);

  form
    .addMultipleChoiceItem()
    .setTitle('¿A veces una clienta queda debiendo o paga en partes?')
    .setChoiceValues(['Sí', 'No']);

  // ──────────────────── 5. Mis ganancias ────────────────────
  form.addPageBreakItem().setTitle('5. Lo que quiero saber de mis ganancias');

  form
    .addParagraphTextItem()
    .setTitle('Al terminar el día o la semana, ¿qué es lo PRIMERO que te gustaría ver?')
    .setHelpText('Ejemplo: cuánto gané en limpio, cuántas clientas atendí, qué servicio dejó más');

  form
    .addMultipleChoiceItem()
    .setTitle('¿Cómo piensas tu negocio?')
    .setChoiceValues(['Por día', 'Por semana', 'Por mes']);

  form
    .addMultipleChoiceItem()
    .setTitle('¿Qué te interesa más saber?')
    .setChoiceValues([
      'Qué servicio me deja más ganancia',
      'Qué servicio hago más seguido',
      'Las dos cosas',
    ]);

  form
    .addParagraphTextItem()
    .setTitle('Cuando ves cuánto ganaste, ¿qué decisiones tomas con esa información?')
    .setHelpText('Ejemplo: subir un precio, dejar de hacer un servicio, comprar más material');

  // ──────────────────── 6. Cómo lo voy a usar ────────────────────
  form.addPageBreakItem().setTitle('6. Cómo voy a usar el sistema');

  form
    .addCheckboxItem()
    .setTitle('¿Desde dónde lo usarías?')
    .setChoiceValues(['Celular', 'Computadora / laptop', 'Tablet']);

  form
    .addMultipleChoiceItem()
    .setTitle('¿Lo usarías tú sola o alguien más también?')
    .setChoiceValues(['Solo yo', 'Alguien más también']);

  form
    .addParagraphTextItem()
    .setTitle('¿En qué momento del día lo abrirías?')
    .setHelpText('Ejemplo: al llegar en la mañana, entre clientas, al cerrar');

  form
    .addParagraphTextItem()
    .setTitle('¿Algo más que te gustaría que el sistema hiciera y no te pregunté aquí?');

  // ───────────────────────── Enlaces de salida ─────────────────────────
  Logger.log('✏️  Editar el formulario:  ' + form.getEditUrl());
  Logger.log('📤  Compartir con la dueña: ' + form.getPublishedUrl());
}
