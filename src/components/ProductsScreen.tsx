// Pantalla de productos de ropa: lista para editar + formulario para añadir.
import { useState, type FormEvent } from 'react';
import { useInventory } from '../lib/store/InventoryContext';
import { parseMoneyToCents } from '../lib/format';
import { ProductRow } from './ProductRow';
import { useToast } from './Toast';
import { btnPrimary, field, fieldLabel, input, rowDivider, screenTitle, surface } from './ui';

export function ProductsScreen() {
  const inv = useInventory();
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [priceText, setPriceText] = useState('');
  const [costText, setCostText] = useState('');
  const [stockText, setStockText] = useState('');

  const price = parseMoneyToCents(priceText);
  const cost = parseMoneyToCents(costText);
  const stock = Number(stockText);

  // Duplicado: mismo nombre (ignorando mayúsculas/espacios), precio y costo.
  const isDuplicate =
    price !== null &&
    cost !== null &&
    inv.products.some(
      (p) => p.name.trim().toLowerCase() === name.trim().toLowerCase() && p.price === price && p.cost === cost,
    );

  const canAdd =
    name.trim() !== '' && price !== null && cost !== null && Number.isFinite(stock) && stock >= 0 && !isDuplicate;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAdd || price === null || cost === null) return;
    inv.addProduct({ name: name.trim(), price, cost, stock: Math.floor(stock) });
    notify('✓ Producto añadido');
    setName('');
    setPriceText('');
    setCostText('');
    setStockText('');
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className={screenTitle}>Productos</h2>

      <form onSubmit={handleSubmit} className={surface + ' grid grid-cols-2 items-end gap-3 p-4'}>
        <h3 className="col-span-2 font-semibold">Añadir producto</h3>
        <label className={field + ' col-span-2'}>
          <span className={fieldLabel}>Nombre</span>
          <input className={input} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Blusa negra" />
        </label>
        <label className={field}>
          <span className={fieldLabel}>Precio de venta</span>
          <input className={input} type="text" inputMode="decimal" value={priceText} onChange={(e) => setPriceText(e.target.value)} />
        </label>
        <label className={field}>
          <span className={fieldLabel}>Costo</span>
          <input className={input} type="text" inputMode="decimal" value={costText} onChange={(e) => setCostText(e.target.value)} />
        </label>
        <label className={field + ' col-span-2'}>
          <span className={fieldLabel}>Stock inicial</span>
          <input className={input} type="number" min={0} value={stockText} onChange={(e) => setStockText(e.target.value)} />
        </label>
        {isDuplicate && (
          <p className="col-span-2 text-sm text-red-700">
            Ya existe un producto con ese nombre, precio y costo. Si necesitas más unidades, usa "Añadir stock".
          </p>
        )}
        <button type="submit" className={btnPrimary + ' col-span-2'} disabled={!canAdd}>
          Añadir producto
        </button>
      </form>

      {inv.products.length === 0 ? (
        <div className={surface + ' p-5'}>
          <p className="font-semibold">Aún no hay productos</p>
          <p className="mt-1 text-muted">Añade el primero arriba.</p>
        </div>
      ) : (
        <div className={surface + ' ' + rowDivider}>
          {inv.products.map((product) => (
            <ProductRow key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}
