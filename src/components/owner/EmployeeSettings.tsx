// "Tu equipo": las empleadas del negocio. Sirven para anotar quién hizo cada
// servicio al cobrar. No son usuarias de la app y no se borran: se dan de baja,
// y su nombre sigue en lo que ya cobraron.
import { useState } from 'react';
import { useStore } from '../../lib/store/StoreContext';
import { useToast } from '../Toast';
import { validateEmployeeName } from '../../lib/domain/employees';
import type { Employee } from '../../lib/domain/types';
import { btnGhostSm, btnPrimary, btnPrimarySm, btnText, card, field, fieldLabel, input } from '../ui';

function EmployeeRow({ employee }: { employee: Employee }) {
  const store = useStore();
  const { notify } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(employee.name);
  const check = validateEmployeeName(name);

  function save() {
    if (!check.ok) return;
    store.renameEmployee(employee.id, check.name);
    setEditing(false);
    notify('✓ Nombre actualizado');
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3">
        <label className={field}>
          <span className={fieldLabel}>Nombre</span>
          <input className={input} type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {!check.ok && <p className="text-sm text-red-600">{check.message}</p>}
        <div className="flex gap-2">
          <button type="button" className={btnPrimarySm} onClick={save} disabled={!check.ok}>
            Guardar
          </button>
          <button
            type="button"
            className={btnText}
            onClick={() => {
              setName(employee.name);
              setEditing(false);
            }}
          >
            Cancelar
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className={'min-w-32 flex-1 truncate ' + (employee.active ? '' : 'text-neutral-400')}>
        {employee.name}
        {!employee.active && <span className="ml-2 text-xs">(dada de baja)</span>}
      </span>
      <button type="button" className={btnGhostSm} onClick={() => setEditing(true)}>
        Cambiar nombre
      </button>
      <button
        type="button"
        className={btnGhostSm}
        onClick={() => {
          store.setEmployeeActive(employee.id, !employee.active);
          notify(employee.active ? 'Empleada dada de baja' : '✓ Empleada de vuelta en el equipo');
        }}
      >
        {employee.active ? 'Dar de baja' : 'Reactivar'}
      </button>
    </li>
  );
}

export function EmployeeSettings() {
  const store = useStore();
  const { notify } = useToast();
  const [newName, setNewName] = useState('');
  const check = validateEmployeeName(newName);

  function handleAdd() {
    if (!check.ok) return;
    store.addEmployee(check.name);
    setNewName('');
    notify('✓ Empleada agregada');
  }

  return (
    <section className={card + ' flex flex-col gap-3'}>
      <div>
        <h2 className="text-lg font-semibold">Tu equipo</h2>
        <p className="text-sm text-neutral-500">
          Agrega a quienes hacen los servicios para anotar quién hizo cada uno al cobrar.
        </p>
      </div>

      {store.employees.length === 0 ? (
        <p className="text-sm text-neutral-500">Todavía no agregaste a nadie.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {store.employees.map((employee) => (
            <EmployeeRow key={employee.id} employee={employee} />
          ))}
        </ul>
      )}

      <label className={field}>
        <span className={fieldLabel}>Nombre de la empleada</span>
        <input
          className={input}
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Por ejemplo, Marta"
        />
      </label>
      <button type="button" className={btnPrimary} onClick={handleAdd} disabled={!check.ok}>
        Agregar empleada
      </button>
    </section>
  );
}
