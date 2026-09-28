import { describe, expect, it } from 'vitest';
import {
  isIOSDevice,
  pushButtonState,
  subscriptionToRow,
  urlBase64ToUint8Array,
  type PushEnvironment,
} from './pushSupport';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

describe('isIOSDevice', () => {
  it('reconoce el iPhone', () => {
    expect(isIOSDevice(IPHONE_UA, 5)).toBe(true);
  });

  it('reconoce el iPad que se presenta como Mac (tiene pantalla táctil)', () => {
    expect(isIOSDevice(IPAD_AS_MAC_UA, 5)).toBe(true);
  });

  it('un Mac de verdad no es iOS', () => {
    expect(isIOSDevice(IPAD_AS_MAC_UA, 0)).toBe(false);
  });

  it('Android no es iOS', () => {
    expect(isIOSDevice(ANDROID_UA, 5)).toBe(false);
  });
});

describe('pushButtonState', () => {
  const ready: PushEnvironment = {
    isIOS: true,
    isStandalone: true,
    hasServiceWorker: true,
    hasPushManager: true,
    permission: 'default',
    subscribed: false,
  };

  it('en el iPhone instalado y sin permiso aún: ofrece activar', () => {
    expect(pushButtonState(ready)).toBe('off');
  });

  it('ya suscrito con permiso: activo', () => {
    expect(pushButtonState({ ...ready, permission: 'granted', subscribed: true })).toBe('on');
  });

  it('permiso concedido pero sin suscripción (se borró): ofrece activar de nuevo', () => {
    expect(pushButtonState({ ...ready, permission: 'granted', subscribed: false })).toBe('off');
  });

  it('en Safari del iPhone SIN instalar: pide instalar primero, no dice "no compatible"', () => {
    // Safari fuera de la pantalla de inicio ni siquiera expone PushManager.
    expect(pushButtonState({ ...ready, isStandalone: false, hasPushManager: false })).toBe('needs-install');
  });

  it('la dueña bloqueó los avisos: se lo dice en vez de fallar al tocar', () => {
    expect(pushButtonState({ ...ready, permission: 'denied' })).toBe('denied');
  });

  it('iPhone instalado pero con iOS viejo (sin PushManager): no compatible', () => {
    expect(pushButtonState({ ...ready, hasPushManager: false })).toBe('unsupported');
  });

  it('navegador sin service worker: no compatible', () => {
    expect(pushButtonState({ ...ready, isIOS: false, isStandalone: false, hasServiceWorker: false }))
      .toBe('unsupported');
  });

  it('Android o escritorio no necesitan instalar para recibir push', () => {
    expect(pushButtonState({ ...ready, isIOS: false, isStandalone: false })).toBe('off');
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodifica base64url sin relleno', () => {
    // "hola" = aG9sYQ (sin "==")
    expect(Array.from(urlBase64ToUint8Array('aG9sYQ'))).toEqual([104, 111, 108, 97]);
  });

  it('traduce los caracteres propios de base64url (- y _)', () => {
    // bytes [251, 255] = "+/8=" en base64 estándar = "-_8" en base64url
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255]);
  });

  it('una clave VAPID pública son 65 bytes empezando por 0x04', () => {
    const key = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
    const bytes = urlBase64ToUint8Array(key);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(4);
  });
});

describe('subscriptionToRow', () => {
  it('saca endpoint y claves del JSON de la suscripción', () => {
    expect(subscriptionToRow({
      endpoint: 'https://web.push.apple.com/abc',
      expirationTime: null,
      keys: { p256dh: 'P', auth: 'A' },
    })).toEqual({ endpoint: 'https://web.push.apple.com/abc', p256dh: 'P', auth: 'A' });
  });

  it('una suscripción incompleta no se guarda', () => {
    expect(subscriptionToRow({ endpoint: 'https://x', keys: { p256dh: 'P' } })).toBeNull();
    expect(subscriptionToRow({ keys: { p256dh: 'P', auth: 'A' } })).toBeNull();
  });
});
