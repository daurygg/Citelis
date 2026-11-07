/**
 * Capturas de la demo de Citelis (Playwright) contra la app local.
 *
 *   cd demo-video && npm install && npx playwright install chromium
 *   BASE_URL=http://localhost:5180 npx tsx capture.ts
 *
 * IDEMPOTENTE: el primer paso borra SOLO los datos de las cuentas ficticias
 * `demo+bella*@citelis.test` (y el negocio "Estudio Bella") de la base LOCAL
 * (contenedor Docker `supabase_db_Citelis`), y luego vuelve a crear todo desde cero
 * con la UI real. Nunca toca ningún proyecto remoto ni `supabase/seed-data.sql`.
 *
 * Salida: demo-video/captures/ (clips .webm, imágenes .png).
 */
import { chromium, type BrowserContext, type Locator, type Page } from 'playwright';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

// ───────────────────────── configuración ─────────────────────────
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5180';
const OUT = path.resolve('captures');
const DB_CONTAINER = 'supabase_db_Citelis';
const TZ = 'America/Santo_Domingo';
const VIEWPORT = { width: 390, height: 844 };
const VIDEO_SIZE = { width: 780, height: 1688 }; // 2x del viewport: nítido en el render final
const NOVELTIES_SEEN = '2026-11-04'; // apaga el modal de novedades

// Datos ficticios (nada real).
const OWNER = { name: 'Laura Méndez', whatsapp: '809 555 0142', type: 'Salón de belleza' };
const ACCOUNT = { email: 'demo+bella@citelis.test', password: 'Bella-Demo#2026-xq7' };
const BUSINESS = { name: 'Estudio Bella', color: '#C2185B' };
const SERVICES = {
  manicure: { name: 'Manicure en gel', price: '800', min: '45', supply: { name: 'Esmalte gel', paid: '650', servings: '20' } },
  corte: { name: 'Corte y secado', price: '1200', min: '60', supply: { name: 'Shampoo y tratamiento', paid: '480', servings: '24' } },
  pedicure: { name: 'Pedicure spa', price: '1000', min: '50', supply: { name: 'Sales y crema', paid: '360', servings: '12' } },
};
const CLIENTS: Record<string, string> = {
  'Ana Pérez': '809 555 0101',
  'Carlos Gómez': '809 555 0102',
  'Marta Ruiz': '809 555 0103',
  'José Díaz': '809 555 0104',
};

// ───────────────────────── utilidades ─────────────────────────
let fast = false; // true = montaje sin grabar: sin pausas, rellena de golpe
const pause = (ms: number) => (fast ? Promise.resolve() : new Promise<void>((r) => setTimeout(r, ms)));

const TAP_INDICATOR = () => {
  // Ondita visible en cada toque, para que se lea en una grabación de teléfono.
  const show = (e: PointerEvent) => {
    if (!document.documentElement) return;
    if (!document.getElementById('__tap_css')) {
      const style = document.createElement('style');
      style.id = '__tap_css';
      style.textContent =
        '.__tap{position:fixed;z-index:2147483647;pointer-events:none;width:46px;height:46px;margin:-23px 0 0 -23px;' +
        'border-radius:50%;background:rgba(20,20,20,.16);border:2px solid rgba(255,255,255,.95);' +
        'box-shadow:0 0 0 1px rgba(0,0,0,.25);animation:__tap .6s ease-out forwards}' +
        '@keyframes __tap{from{transform:scale(.35);opacity:1}to{transform:scale(1.45);opacity:0}}' +
        '::-webkit-scrollbar{display:none!important}*{scrollbar-width:none!important}';
      document.documentElement.appendChild(style);
    }
    const dot = document.createElement('div');
    dot.className = '__tap';
    dot.style.left = e.clientX + 'px';
    dot.style.top = e.clientY + 'px';
    document.documentElement.appendChild(dot);
    setTimeout(() => dot.remove(), 700);
  };
  window.addEventListener('pointerdown', show, true);
};

/** Desplaza suave hasta dejar el elemento a la vista (solo si hace falta). */
async function reveal(loc: Locator) {
  if (fast) return;
  await loc.waitFor({ state: 'visible' });
  await loc.evaluate(async (el) => {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.top < 90 || r.bottom > vh - 110) {
      window.scrollTo({ top: window.scrollY + r.top - vh / 2 + r.height / 2, behavior: 'smooth' });
      await new Promise((res) => setTimeout(res, 800));
    }
  });
}

async function tapOn(loc: Locator) {
  if (fast) {
    await loc.click();
    return;
  }
  await reveal(loc);
  await pause(750);
  await loc.tap();
  await pause(550);
}

async function typeInto(loc: Locator, text: string) {
  if (fast) {
    await loc.fill(text);
    return;
  }
  await reveal(loc);
  await pause(450);
  await loc.tap();
  await pause(300);
  await loc.fill('');
  await loc.pressSequentially(text, { delay: 75 });
  await pause(500);
}

async function scrollTop(page: Page) {
  if (fast) return;
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await pause(800);
}

const tab = (page: Page, name: string) => page.locator('nav').getByRole('button', { name, exact: true });

const failures: string[] = [];
async function shot(page: Page, name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures.push(name);
    console.error(`FAIL ${name}:`, (err as Error).message.split('\n')[0]);
    await page.screenshot({ path: path.join(OUT, `_debug-${name}.png`) }).catch(() => {});
  }
}

/** Graba un clip (.webm) con la API de screencast de Playwright; siempre lo cierra. */
async function clip(page: Page, name: string, fn: () => Promise<void>, tailMs = 1100) {
  await shot(page, name, async () => {
    await page.screencast.start({ path: path.join(OUT, `${name}.webm`), size: VIDEO_SIZE, quality: 95 });
    try {
      await pause(700);
      await fn();
      await pause(tailMs);
    } finally {
      await page.screencast.stop();
    }
  });
}

// ───────────────────────── base local ─────────────────────────
function psql(sql: string): string {
  return execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-At', '-c', sql], {
    encoding: 'utf8',
  }).trim();
}

/** Borra SOLO lo de las cuentas demo ficticias, en la base local. El resto de las tablas cae en cascada. */
function resetDemoData() {
  psql(`
    do $$
    begin
      delete from public.business where id in (
        select bm.business_id from public.business_member bm
        join auth.users u on u.id = bm.user_id
        where u.email like 'demo+bella%@citelis.test'
      ) or name = 'Estudio Bella';
      delete from auth.users where email like 'demo+bella%@citelis.test';
    end $$;`);
  console.log('reset: datos demo anteriores borrados (base local)');
}

// ───────────────────────── fechas ─────────────────────────
function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}
function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ───────────────────────── acciones de la app (montaje) ─────────────────────────
async function openSchedule(page: Page) {
  const open = page.getByRole('button', { name: 'Agendar una cita' });
  if (await open.isVisible()) await tapOn(open);
}

async function pickClient(page: Page, name: string, known: Set<string>) {
  const combo = page.getByRole('combobox');
  if (known.has(name)) {
    await combo.fill(name);
    await page.getByRole('option', { name: new RegExp(name) }).first().click();
  } else {
    await combo.click();
    await page.getByRole('option', { name: '+ Agregar cliente' }).click();
    await page.getByLabel('Nombre', { exact: true }).fill(name);
    await page.getByLabel(/Teléfono/).fill(CLIENTS[name]);
    known.add(name);
  }
}

async function setServiceChips(page: Page, wanted: string) {
  const form = page.locator('form').filter({ hasText: 'Servicios (puedes elegir varios)' });
  const target = form.getByRole('button', { name: wanted, exact: true });
  if ((await target.getAttribute('aria-pressed')) !== 'true') await target.click();
  for (const other of Object.values(SERVICES)) {
    if (other.name === wanted) continue;
    const chip = form.getByRole('button', { name: other.name, exact: true });
    if ((await chip.count()) && (await chip.getAttribute('aria-pressed')) === 'true') await chip.click();
  }
}

type Pay = 'Efectivo' | 'Transferencia' | 'Tarjeta' | 'credit';

/** Atención ya hecha y cobrada (puede ir en el pasado: así se arma el historial del reporte, por la UI). */
async function walkIn(page: Page, known: Set<string>, o: { client: string; service: string; at: string; pay: Pay }) {
  await openSchedule(page);
  await pickClient(page, o.client, known);
  await setServiceChips(page, o.service);
  await page.getByLabel(/Fecha y hora/).fill(o.at);
  const check = page.getByRole('checkbox', { name: /Ya la atendí/ });
  if (!(await check.isChecked())) await check.check();
  await page
    .getByRole('group', { name: 'Vía de pago' })
    .getByRole('button', { name: o.pay === 'credit' ? 'Todavía no pagó (a crédito)' : o.pay })
    .click();
  await page.getByRole('button', { name: 'Registrar y cobrar' }).click();
  await page.getByRole('button', { name: 'Agendar una cita' }).waitFor({ timeout: 15000 });
}

/** Cita pendiente (sin abono), creada de golpe. */
async function scheduleQuick(page: Page, known: Set<string>, o: { client: string; service: string; at: string }) {
  await openSchedule(page);
  await pickClient(page, o.client, known);
  await setServiceChips(page, o.service);
  await page.getByLabel(/Fecha y hora/).fill(o.at);
  const check = page.getByRole('checkbox', { name: /Ya la atendí/ });
  if (await check.isChecked()) await check.uncheck();
  await page.getByRole('button', { name: 'Agendar', exact: true }).click();
  await page.getByRole('button', { name: 'Agendar una cita' }).waitFor({ timeout: 15000 });
}

async function addServiceViaEditor(page: Page, s: (typeof SERVICES)['corte']) {
  await tab(page, 'Servicios').click();
  await page.getByRole('button', { name: 'Nuevo servicio' }).click();
  await page.getByLabel('Nombre del servicio').fill(s.name);
  await page.getByLabel('Precio de venta').fill(s.price);
  await page.getByLabel('Duración (min)').fill(s.min);
  await page.getByLabel('Nuevo insumo').fill(s.supply.name);
  await page.getByLabel('¿Cuánto pagaste?').fill(s.supply.paid);
  await page.getByLabel('¿Para cuántos servicios alcanza?').fill(s.supply.servings);
  await page.getByRole('button', { name: 'Añadir insumo' }).click();
  await page.getByText('Por servicio:').first().waitFor();
  await page.getByRole('button', { name: 'Volver a servicios' }).click();
}

// ───────────────────────── main ─────────────────────────
async function main() {
  mkdirSync(OUT, { recursive: true });
  // Limpia la salida anterior (solo captures/, que está en .gitignore).
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  resetDemoData();

  // DSF 2 NATIVO (no emulado): el screencast de Playwright solo entrega fotogramas a 2x así;
  // con deviceScaleFactor emulado salen a 1x (390x844) pegados en una esquina del video.
  const browser = await chromium.launch({
    args: ['--force-device-scale-factor=2', `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
  });
  const newContext = (): Promise<BrowserContext> =>
    browser.newContext({
      viewport: null,
      hasTouch: true,
      locale: 'es-DO',
      timezoneId: TZ,
      reducedMotion: 'no-preference',
    });
  const initContext = async (ctx: BrowserContext) => {
    await ctx.addInitScript((v) => {
      try {
        localStorage.setItem('citelis.novedades', v);
      } catch {
        /* sin storage */
      }
    }, NOVELTIES_SEEN);
    await ctx.addInitScript(TAP_INDICATOR);
  };

  const ctx = await newContext();
  await initContext(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const known = new Set<string>();
  const today = todayISO();
  const at = (day: string, hhmm: string) => `${day}T${hhmm}`;

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // 1 ── Crear cuenta
  await clip(page, 'login', async () => {
    await tapOn(page.getByRole('tab', { name: 'Crear cuenta' }));
    await typeInto(page.getByLabel('Correo'), ACCOUNT.email);
    await typeInto(page.getByLabel(/^Contraseña/), ACCOUNT.password);
    await typeInto(page.getByLabel('Confirmar contraseña'), ACCOUNT.password);
    await tapOn(page.getByRole('button', { name: 'Crear mi cuenta' }));
    await page.getByRole('heading', { name: 'Te damos la bienvenida' }).waitFor({ timeout: 20000 });
    await pause(1200);
  });

  // 2 ── Cuéntanos de ti
  await clip(page, 'owner-profile', async () => {
    await tapOn(page.getByRole('button', { name: 'Crear mi negocio' }));
    await page.getByRole('heading', { name: 'Cuéntanos de ti' }).waitFor();
    await pause(500);
    await typeInto(page.getByLabel('Tu nombre'), OWNER.name);
    await typeInto(page.getByLabel('Tu WhatsApp'), OWNER.whatsapp);
    await tapOn(page.getByRole('radio', { name: OWNER.type }));
    await tapOn(page.getByRole('button', { name: 'Seguir' }));
    await page.getByRole('heading', { name: 'Tu negocio' }).waitFor();
    await pause(700);
  });

  // 3 ── Asistente inicial (nombre/color, horario, primer servicio, final)
  await clip(page, 'wizard', async () => {
    await typeInto(page.getByLabel('Nombre del negocio'), BUSINESS.name);
    await typeInto(page.getByLabel(/O escribe el código/), BUSINESS.color);
    await pause(700);
    await tapOn(page.getByRole('button', { name: 'Crear mi negocio' }));
    await page.getByRole('heading', { name: '¿Cuándo atiendes?' }).waitFor({ timeout: 20000 });
    await pause(600);
    await tapOn(page.getByRole('radio', { name: 'Lunes a sábado' }));
    await page.getByLabel('Cierras a las').fill('19:00'); // los campos de hora nativos no se teclean bien en móvil
    await pause(900);
    await tapOn(page.getByRole('button', { name: 'Guardar y seguir' }));
    await page.getByRole('heading', { name: 'Tu primer servicio' }).waitFor();
    await pause(500);
    await typeInto(page.getByLabel('¿Cómo se llama?'), SERVICES.manicure.name);
    await typeInto(page.getByLabel('¿Cuánto cobras?'), SERVICES.manicure.price);
    await typeInto(page.getByLabel(/¿Cuánto dura/), SERVICES.manicure.min);
    await tapOn(page.getByRole('button', { name: 'Guardar y seguir' }));
    await page.getByText('Tu negocio ya está en marcha.').waitFor();
    await pause(1800);
    await tapOn(page.getByRole('button', { name: 'Ir a mi agenda' }));
    await page.getByRole('heading', { name: BUSINESS.name }).waitFor();
    await pause(600);
  });

  if (failures.length) throw new Error(`la cadena de alta falló (${failures.join(', ')}); no tiene sentido seguir`);

  // 4 ── Servicios e insumos: ¿cuánto pagaste? / ¿para cuántos alcanza? → margen
  await clip(page, 'service-editor', async () => {
    await tapOn(tab(page, 'Servicios'));
    await tapOn(page.getByRole('button', { name: new RegExp(SERVICES.manicure.name) }));
    await page.getByText('Nombre del servicio').waitFor();
    await pause(900);
    const s = SERVICES.manicure.supply;
    await typeInto(page.getByLabel('Nuevo insumo'), s.name);
    await typeInto(page.getByLabel('¿Cuánto pagaste?'), s.paid);
    await typeInto(page.getByLabel('¿Para cuántos servicios alcanza?'), s.servings);
    await tapOn(page.getByRole('button', { name: 'Añadir insumo' }));
    await page.getByText('Por servicio:').first().waitFor();
    await pause(500);
    await reveal(page.getByText('Margen', { exact: true }));
    await pause(1800);
    await tapOn(page.getByRole('button', { name: 'Volver a servicios' }));
    await pause(1500);
  });

  // ── Montaje sin grabar: resto de servicios, reservas abiertas, historial y citas de hoy
  fast = true;
  await shot(page, 'setup-services', async () => {
    await addServiceViaEditor(page, SERVICES.corte);
    await addServiceViaEditor(page, SERVICES.pedicure);
  });
  await shot(page, 'setup-bookings', async () => {
    await tab(page, 'Reservas').click();
    await page.getByText('Reservas en línea').first().waitFor();
    for (let i = 0; i < 4; i++) {
      if (await page.getByText('Abierto', { exact: true }).isVisible()) break;
      await page.getByText('Cerrado', { exact: true }).click();
      await page.getByText('Abierto', { exact: true }).waitFor({ timeout: 5000 }).catch(() => {});
    }
    await page.getByText('Abierto', { exact: true }).waitFor();
  });
  await shot(page, 'setup-history', async () => {
    await tab(page, 'Agenda').click();
    const M = SERVICES.manicure.name;
    const C = SERVICES.corte.name;
    const P = SERVICES.pedicure.name;
    const d = (n: number) => shiftDay(today, -n);
    const rows: { client: string; service: string; at: string; pay: Pay }[] = [
      { client: 'Marta Ruiz', service: M, at: at(d(5), '10:00'), pay: 'Efectivo' },
      { client: 'José Díaz', service: C, at: at(d(5), '14:00'), pay: 'Tarjeta' },
      { client: 'Carlos Gómez', service: P, at: at(d(4), '11:00'), pay: 'Transferencia' },
      { client: 'Marta Ruiz', service: C, at: at(d(4), '15:30'), pay: 'Efectivo' },
      { client: 'José Díaz', service: M, at: at(d(3), '09:30'), pay: 'Transferencia' },
      { client: 'Carlos Gómez', service: C, at: at(d(3), '13:00'), pay: 'Tarjeta' },
      { client: 'Marta Ruiz', service: P, at: at(d(2), '10:30'), pay: 'Efectivo' },
      { client: 'José Díaz', service: M, at: at(d(2), '16:00'), pay: 'Efectivo' },
      { client: 'Carlos Gómez', service: M, at: at(d(1), '11:00'), pay: 'Transferencia' },
      { client: 'Marta Ruiz', service: C, at: at(d(1), '14:30'), pay: 'credit' },
      { client: 'José Díaz', service: P, at: at(d(1), '17:00'), pay: 'Tarjeta' },
      // hoy: dos ya cobradas
      { client: 'Marta Ruiz', service: M, at: at(today, '09:30'), pay: 'Efectivo' },
      { client: 'José Díaz', service: C, at: at(today, '11:00'), pay: 'Transferencia' },
    ];
    for (const r of rows) await walkIn(page, known, r);
  });
  await shot(page, 'setup-today-pending', async () => {
    await scheduleQuick(page, known, { client: 'Carlos Gómez', service: SERVICES.pedicure.name, at: at(today, '13:00') });
    await scheduleQuick(page, known, { client: 'José Díaz', service: SERVICES.manicure.name, at: at(today, '17:00') });
  });
  fast = false;
  await page.reload({ waitUntil: 'networkidle' });
  await tab(page, 'Agenda').click();

  // 5 ── Agendar cita (cliente nueva + abono)
  await clip(page, 'schedule', async () => {
    await tapOn(page.getByRole('button', { name: 'Agendar una cita' }));
    await page.getByRole('heading', { name: 'Agendar cita' }).waitFor();
    await tapOn(page.getByRole('combobox'));
    await tapOn(page.getByRole('option', { name: '+ Agregar cliente' }));
    await typeInto(page.getByLabel('Nombre', { exact: true }), 'Ana Pérez');
    await typeInto(page.getByLabel(/Teléfono/), CLIENTS['Ana Pérez']);
    const form = page.locator('form').filter({ hasText: 'Servicios (puedes elegir varios)' });
    await tapOn(form.getByRole('button', { name: SERVICES.corte.name, exact: true }));
    const manicure = form.getByRole('button', { name: SERVICES.manicure.name, exact: true });
    if ((await manicure.getAttribute('aria-pressed')) === 'true') await tapOn(manicure);
    await reveal(page.getByLabel(/Fecha y hora/));
    await pause(500);
    await page.getByLabel(/Fecha y hora/).fill(at(today, '15:00'));
    await pause(1100);
    await typeInto(page.getByLabel(/Abono/), '300');
    await tapOn(page.getByRole('group', { name: 'Vía del abono' }).getByRole('button', { name: 'Transferencia' }));
    await tapOn(page.getByRole('button', { name: 'Agendar', exact: true }));
    await page.getByText('✓ Cita agendada').first().waitFor();
    await pause(1200);
  });
  await scrollTop(page);
  await page.getByText('Ana Pérez').first().waitFor();
  await pause(2500); // deja que el aviso se vaya antes de las fotos

  // 6 ── Tu día
  await shot(page, 'agenda', async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'agenda-top.png') });
    // La foto principal: del título del día hacia abajo (Ganado/Proyectado/Cobrado + filas).
    await page.getByRole('heading', { name: 'Viernes' }).or(page.locator('section h2.capitalize')).first().evaluate((el) => {
      window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 64);
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'agenda.png') });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(OUT, 'agenda-full.png'), fullPage: true });
  });

  // 7 ── Cobrar
  await clip(page, 'charge', async () => {
    const row = page.getByRole('listitem').filter({ hasText: 'Carlos Gómez' }).filter({ hasText: SERVICES.pedicure.name });
    await tapOn(row.getByRole('button', { name: 'Cobrar', exact: true }));
    await row.getByText('¿Cómo te pagó?').waitFor();
    await pause(900);
    await tapOn(row.getByRole('group', { name: 'Vía del pago 1' }).getByRole('button', { name: 'Transferencia' }));
    await tapOn(row.getByRole('button', { name: 'Completar cita' }));
    await row.getByText(/Cobró/).waitFor();
    await pause(1700); // se ve entrar el dinero
  }, 600);
  await page.waitForTimeout(2500);

  // Recibo (con QR), opcional
  await shot(page, 'receipt', async () => {
    const row = page.getByRole('listitem').filter({ hasText: 'Carlos Gómez' }).filter({ hasText: SERVICES.pedicure.name });
    await row.getByRole('button', { name: 'Recibo' }).click();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(OUT, 'receipt.png') });
    await page.keyboard.press('Escape');
    const close = page.getByRole('button', { name: /Cerrar/ }).first();
    if (await close.isVisible()) await close.click();
  });
  await page.waitForTimeout(500);

  // 8 ── Enlace público (Mi negocio) y portal de reservas
  await shot(page, 'public-link', async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: 'Mi negocio', exact: true }).click();
    const h = page.getByRole('heading', { name: 'La dirección de tu página' });
    await h.waitFor();
    await h.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -16));
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'public-link.png') });
    await page.getByRole('button', { name: 'Volver', exact: true }).click();
  });
  await shot(page, 'reservas', async () => {
    await tab(page, 'Reservas').click();
    await page.getByText('Reservas en línea').first().waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'reservas.png') });
  });

  // 9 ── Reporte
  await shot(page, 'report', async () => {
    await tab(page, 'Reporte').click();
    await page.getByRole('heading', { name: 'Reporte de ganancias' }).waitFor();
    await page.getByText('¿Cómo te pagaron?').waitFor();
    await page.getByText('¿Quién te compró?').waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, 'report.png') });
    await page.screenshot({ path: path.join(OUT, 'report-full.png'), fullPage: true });
  });

  // 8b ── Portal público de reservas (contexto aparte, sin sesión)
  await shot(page, 'booking', async () => {
    const slug = psql(
      `select bp.public_slug from public.booking_policy bp join public.business b on b.id = bp.business_id where b.name = 'Estudio Bella' limit 1`,
    );
    if (!slug) throw new Error('el negocio no tiene public_slug');
    const pctx = await newContext();
    await initContext(pctx);
    const pub = await pctx.newPage();
    try {
      await pub.goto(`${BASE_URL}/reservar/${slug}`, { waitUntil: 'networkidle' });
      await pub.getByRole('heading', { name: '¿Qué te vas a hacer?' }).waitFor({ timeout: 20000 });
      await pub.screencast.start({ path: path.join(OUT, 'booking.webm'), size: VIDEO_SIZE, quality: 95 });
      try {
        await pause(900);
        await tapOn(pub.getByRole('button', { name: new RegExp(SERVICES.manicure.name) }));
        await pause(500);
        await tapOn(pub.getByRole('button', { name: 'Elegir hora' }));
        await pub.getByRole('heading', { name: '¿Cuándo te queda bien?' }).waitFor();
        await pause(900);
        // Primer día con horarios libres (hoy puede estar ya cerrado).
        const strip = pub.locator('button[aria-pressed]').filter({ hasText: /^\s*(hoy|[a-zá]{3})\s*\d{1,2}\s*$/i });
        const n = await strip.count();
        let found = false;
        for (let i = 0; i < Math.min(n, 8) && !found; i++) {
          await tapOn(strip.nth(i));
          await pub.waitForTimeout(900);
          found = (await pub.getByRole('region', { name: /Mañana|Tarde|Noche/ }).count()) > 0;
        }
        if (!found) throw new Error('ningún día con horarios');
        const slot = pub.getByRole('region', { name: /Mañana|Tarde|Noche/ }).first().getByRole('button').nth(1);
        await tapOn(slot);
        await pause(1500);
        await pub.screenshot({ path: path.join(OUT, 'booking.png') });
      } finally {
        await pub.screencast.stop();
      }
    } finally {
      await pctx.close();
    }
  });

  // 10 ── Ícono para el cierre
  await shot(page, 'icon', async () => {
    copyFileSync(path.resolve('..', 'public', 'icons', 'icon-512.png'), path.join(OUT, 'icon-512.png'));
  });

  await ctx.close();
  await browser.close();

  if (failures.length) {
    console.error(`\nFALLARON: ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\ncapturas completas →', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
