// Selector de clienta para "Agendar una cita": buscar en el registro del negocio o
// crear una nueva en el momento.
//
// POR QUÉ ES ASÍ
//   La dueña casi siempre agenda a alguien que ya conoce: buscar por nombre o
//   teléfono y tocar es más rápido (y más limpio) que reescribirla y acabar con tres
//   "Ana" distintas. La clienta nueva se escribe aquí mismo y se guarda con la cita:
//   no hay pantalla aparte (el servidor la crea al agendar).
//
// Es una lista de botones, no un menú flotante: en un teléfono de 360 px un menú
// absoluto se sale de la pantalla o queda tapado por el teclado. Toda decisión
// (búsqueda, iniciales, duplicados) vive en `lib/domain/clients.ts` (INVARIANTE 5).
import { useId, useRef, useState } from 'react';
import { PHONE_INVALID_MESSAGE, clientInitials, findClientByPhone, isValidPhone, searchClients } from '../lib/domain/clients';
import type { Client } from '../lib/domain/types';
import { btnQuiet, field, fieldLabel, input } from './ui';

/** Una clienta nueva con teléfono escrito que no es válido: no se puede agendar así. */
export function hasInvalidNewPhone(selection: ClientSelection): boolean {
  return selection.client_id === null && selection.phone.trim() !== '' && !isValidPhone(selection.phone);
}

/** Lo elegido o tecleado. `client_id` null = clienta nueva (o aún sin elegir). */
export interface ClientSelection {
  client_id: number | null;
  name: string;
  phone: string;
}

export const EMPTY_CLIENT_SELECTION: ClientSelection = { client_id: null, name: '', phone: '' };

const rowButton =
  'flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-700';

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700"
    >
      {clientInitials(name)}
    </span>
  );
}

function ClientLine({ name, phone }: { name: string; phone: string | null }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-medium text-ink">{name}</span>
      <span className="truncate text-sm text-muted">{phone?.trim() ? phone : 'Sin teléfono'}</span>
    </span>
  );
}

export function ClientPicker({
  clients,
  value,
  onChange,
}: {
  clients: readonly Client[];
  value: ClientSelection;
  onChange: (next: ClientSelection) => void;
}) {
  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  function choose(client: Client) {
    onChange({ client_id: client.id, name: client.name, phone: client.phone ?? '' });
    setQuery('');
    setOpen(false);
  }

  function change() {
    onChange(EMPTY_CLIENT_SELECTION);
    setMode('search');
    // Tras "Cambiar" el input vuelve a existir: se enfoca para seguir tecleando.
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  function startNew() {
    // Si lo tecleado parece un nombre (no un teléfono), se aprovecha.
    const looksLikeName = query.trim() !== '' && !/\d/.test(query);
    onChange({ client_id: null, name: looksLikeName ? query.trim() : '', phone: '' });
    setMode('new');
    setOpen(false);
  }

  // Ya elegida: una ficha compacta con la opción de cambiarla.
  if (value.client_id !== null) {
    return (
      <div className={field}>
        <span className={fieldLabel}>Clienta</span>
        <div className="flex items-center gap-2 rounded-xl bg-white p-1 pl-2 ring-1 ring-line">
          <Avatar name={value.name} />
          <ClientLine name={value.name} phone={value.phone} />
          <button type="button" className={btnQuiet + ' ml-auto'} onClick={change}>
            Cambiar
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'new') {
    const duplicate = findClientByPhone(clients, value.phone);
    const phoneInvalid = hasInvalidNewPhone(value);
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className={fieldLabel + ' text-sm'}>Clienta nueva</span>
          <button type="button" className={btnQuiet + ' -mr-3'} onClick={change}>
            Buscar en mi lista
          </button>
        </div>
        <label className={field}>
          <span className={fieldLabel}>Nombre</span>
          <input
            className={input}
            type="text"
            autoComplete="off"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="Nombre de la clienta"
            required
          />
        </label>
        <label className={field}>
          <span className={fieldLabel}>Teléfono (opcional)</span>
          <input
            className={input}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={value.phone}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
            placeholder="Para avisarle por WhatsApp"
            aria-invalid={phoneInvalid}
            aria-describedby={phoneInvalid ? listId + '-phone-error' : undefined}
          />
          {phoneInvalid ? (
            <span id={listId + '-phone-error'} role="alert" className="text-sm text-red-700">
              {PHONE_INVALID_MESSAGE}
            </span>
          ) : (
            <span className="text-xs text-muted">Se guarda con la cita</span>
          )}
        </label>
        {duplicate && (
          // Dos clientas con el mismo teléfono no caben en el registro: se ofrece la que ya existe.
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-paper p-2 text-sm text-ink ring-1 ring-line">
            <span className="w-full">
              Ya tienes a <strong className="font-semibold">{duplicate.name}</strong> con ese teléfono.
            </span>
            <button
              type="button"
              className="min-h-11 rounded-lg bg-white px-3 font-medium text-ink ring-1 ring-line hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
              onClick={() => choose(duplicate)}
            >
              Usar a {duplicate.name}
            </button>
          </div>
        )}
      </div>
    );
  }

  const results = searchClients(clients, query);
  const showList = open;

  return (
    <div
      ref={rootRef}
      className={field}
      onBlur={(e) => {
        // Se cierra solo cuando el foco sale del selector completo.
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          // Escape cierra la lista sin cerrar el formulario que la contiene.
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <label htmlFor={listId + '-q'} className={fieldLabel}>
        Clienta
      </label>
      <input
        id={listId + '-q'}
        ref={searchRef}
        className={input}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Tras Escape el foco sigue en el campo: tocarlo de nuevo no dispara onFocus.
        onClick={() => setOpen(true)}
        placeholder="Buscar por nombre o teléfono"
      />
      {showList && (
        <ul id={listId} role="listbox" aria-label="Clientas" className="flex flex-col rounded-xl bg-white p-1 ring-1 ring-line">
          {results.map((client) => (
            <li key={client.id} role="presentation">
              <button type="button" role="option" aria-selected={false} className={rowButton} onClick={() => choose(client)}>
                <Avatar name={client.name} />
                <ClientLine name={client.name} phone={client.phone} />
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li role="presentation" className="px-2 py-2 text-sm text-muted">
              {clients.length === 0 ? 'Todavía no tienes clientas guardadas.' : 'No encontramos a nadie con eso.'}
            </li>
          )}
          <li role="presentation">
            <button type="button" role="option" aria-selected={false} className={rowButton + ' font-semibold text-brand-700'} onClick={startNew}>
              + Nueva clienta
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
