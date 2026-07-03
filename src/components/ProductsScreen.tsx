// Pantalla de productos de ropa: lista para editar + formulario para añadir.
import { useState, type FormEvent } from 'react';
import { useInventory } from '../lib/store/InventoryContext';
import { parseMoneyToCents } from '../lib/format';
import { ProductRow } from './ProductRow';
import { useToast } from './Toast';
import { btnPrimary, card, field, fieldLabel, input } from './ui';

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
  const canAdd = name.trim() !== '' && price !== null && cost !== null && Number.isFinite(stock) && stock >= 0;

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
      <h2 className="text-lg font-semibold">Productos</h2>

      <form onSubmit={handleSubmit} className={card + ' flex flex-col gap-3'}>
        <h3 className="font-medium">Añadir producto</h3>
        <label className={field}>
          <span className={fieldLabel}>Nombre</span>
          <input className={input} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Blusa negra" />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className={field + ' flex-1'}>
            <span className={fieldLabel}>Precio de venta</span>
            <input className={input} type="text" inputMode="decimal" value={priceText} onChange={(e) => setPriceText(e.target.value)} />
          </label>
          <label className={field + ' flex-1'}>
            <span className={fieldLabel}>Costo</span>
            <input className={input} type="text" inputMode="decimal" value={costText} onChange={(e) => setCostText(e.target.value)} />
          </label>
          <label className={field + ' flex-1'}>
            <span className={fieldLabel}>Stock inicial</span>
            <input className={input} type="number" min={0} value={stockText} onChange={(e) => setStockText(e.target.value)} />
          </label>
        </div>
        <button type="submit" className={btnPrimary} disabled={!canAdd}>
          Añadir producto
        </button>
      </form>

      {inv.products.length === 0 ? (
        <p className={card + ' text-neutral-500'}>Aún no hay productos. Añade el primero arriba.</p>
      ) : (
        inv.products.map((product) => <ProductRow key={product.id} product={product} />)
      )}
    </section>
  );
}
