// "Datos del recibo": lo que sale arriba del recibo (logo, dirección, teléfono) y el
// nombre con el que cada persona aparece como "Cajero". Cero lógica aquí
// (INVARIANTE 5): validar tipo, peso y largos vive en `domain/receiptProfile.ts`.
// Todo espera al servidor: si lo rechaza, la dueña ve el motivo.
import { useRef, useState } from 'react';
import { useStore } from '../../lib/store/StoreContext';
import { useToast } from '../Toast';
import { btnGhost, btnPrimary, btnText, card, field, fieldLabel, input } from '../ui';

export function ReceiptSettings() {
  const store = useStore();
  const { notify } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const savedAddress = store.business?.address ?? '';
  const savedPhone = store.business?.phone ?? '';
  const savedName = store.memberNames.find((m) => m.user_id === store.currentUserId)?.display_name ?? '';

  const [address, setAddress] = useState(savedAddress);
  const [phone, setPhone] = useState(savedPhone);
  const [name, setName] = useState(savedName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profileDirty = address.trim() !== savedAddress || phone.trim() !== savedPhone;
  const nameDirty = name.trim() !== savedName;

  async function run(action: () => Promise<{ ok: true } | { ok: false; message: string }>, done: string) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (result.ok) notify(done);
    else setError(result.message);
  }

  function handleFile(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = '';
    if (file) void run(() => store.uploadBusinessLogo(file), '✓ Logo guardado');
  }

  return (
    <div className={card + ' flex flex-col gap-4'}>
      <div>
        <h2 className="text-lg font-semibold">Datos del recibo</h2>
        <p className="text-sm text-neutral-500">Aparecen arriba del recibo que le das a tu clienta.</p>
      </div>

      <div className="flex flex-col gap-2">
        <span className={fieldLabel + ' text-sm'}>Logo</span>
        {store.businessLogoUrl ? (
          <img
            src={store.businessLogoUrl}
            alt="Logo de tu negocio"
            className="max-h-24 max-w-40 self-start rounded-lg border border-neutral-200 bg-white object-contain p-1"
          />
        ) : (
          <p className="text-sm text-neutral-400">Todavía no tienes logo.</p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost} disabled={busy} onClick={() => fileRef.current?.click()}>
            {store.businessLogoUrl ? 'Cambiar logo' : 'Elegir logo'}
          </button>
          {store.businessLogoUrl && (
            <button
              type="button"
              className={btnText}
              disabled={busy}
              onClick={() => void run(() => store.removeBusinessLogo(), 'Logo quitado')}
            >
              Quitar logo
            </button>
          )}
        </div>
        <p className="text-xs text-neutral-500">Imagen PNG, JPG o WebP, de hasta 500 KB.</p>
      </div>

      <label className={field}>
        <span className={fieldLabel}>Dirección</span>
        <input className={input} type="text" value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <label className={field}>
        <span className={fieldLabel}>Teléfono</span>
        <input className={input} type="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <button
        type="button"
        className={btnPrimary}
        disabled={!profileDirty || busy}
        onClick={() => void run(() => store.updateReceiptProfile({ address, phone }), '✓ Datos guardados')}
      >
        Guardar dirección y teléfono
      </button>

      <div className="flex flex-col gap-2 border-t border-neutral-200 pt-4">
        <label className={field}>
          <span className={fieldLabel}>Tu nombre en los recibos</span>
          <input
            className={input}
            type="text"
            value={name}
            maxLength={60}
            placeholder="Ej. Ana"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p className="text-xs text-neutral-500">Sale como "Cajero" cuando tú cobras.</p>
        <button
          type="button"
          className={btnPrimary}
          disabled={!nameDirty || busy}
          onClick={() => void run(() => store.setMyDisplayName(name), '✓ Nombre guardado')}
        >
          Guardar mi nombre
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
