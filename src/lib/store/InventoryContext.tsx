// Data layer del módulo de ROPA (separado de servicios, INVARIANTE 3). Carga
// productos y ventas del negocio y expone una fachada síncrona con write-through
// a Supabase. Los cálculos viven en el dominio puro (INVARIANTE 5).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Product, Sale } from '../domain/inventory/types';
import { canSell, salesSummary, type SalesSummary } from '../domain/inventory/sales';
import { nowLocalDatetime } from '../format';
import { supabase } from '../supabase/client';

export interface ProductInput {
  name: string;
  price: number; // centavos
  cost: number; // centavos
  stock: number; // unidades iniciales
}
export interface ProductPatch {
  name?: string;
  price?: number;
  cost?: number;
}

export interface Inventory {
  products: readonly Product[];
  salesReport: (from: string, to: string) => SalesSummary;
  salesInPeriod: (from: string, to: string) => Sale[];
  deleteSale: (saleId: number) => void; // borra una venta y restaura el stock
  addProduct: (input: ProductInput) => void;
  updateProduct: (id: number, patch: ProductPatch) => void;
  deleteProduct: (id: number) => void;
  restock: (productId: number, units: number) => void;
  // Registra una venta si hay stock; devuelve false si no se pudo (sin stock).
  registerSale: (productId: number, quantity: number, overridePrice?: number) => boolean;
}

const InventoryContext = createContext<Inventory | null>(null);

function newId(): number {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}
function persist(op: PromiseLike<{ error: unknown }>): void {
  op.then((res) => {
    if (res.error) console.error('Ropa: persistencia falló:', res.error);
  });
}

interface Loaded {
  businessId: number;
  products: Product[];
  sales: Sale[];
}

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: members } = await supabase.from('business_member').select('business_id').limit(1);
      const businessId = members && members.length > 0 ? (members[0] as { business_id: number }).business_id : 0;
      const [p, s] = await Promise.all([
        supabase.from('product').select('*'),
        supabase.from('sale').select('*'),
      ]);
      if (!active) return;
      setLoaded({ businessId, products: (p.data ?? []) as Product[], sales: (s.data ?? []) as Sale[] });
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!loaded) {
    return <div className="p-6 text-center text-neutral-500">Cargando ropa…</div>;
  }
  return <InventoryReady loaded={loaded}>{children}</InventoryReady>;
}

function InventoryReady({ loaded, children }: { loaded: Loaded; children: ReactNode }) {
  const businessId = loaded.businessId;
  const [products, setProducts] = useState<readonly Product[]>(loaded.products);
  const [sales, setSales] = useState<readonly Sale[]>(loaded.sales);

  function salesReport(from: string, to: string): SalesSummary {
    return salesSummary(sales, businessId, from, to);
  }

  // Ventas del periodo (más recientes primero), para revisarlas o corregirlas.
  function salesInPeriod(from: string, to: string): Sale[] {
    const fromTime = new Date(from).getTime();
    const toTime = new Date(to).getTime();
    return sales
      .filter((s) => s.business_id === businessId)
      .filter((s) => {
        const t = new Date(s.datetime).getTime();
        return t >= fromTime && t < toTime;
      })
      .sort((a, b) => b.datetime.localeCompare(a.datetime));
  }

  // Borra una venta registrada por error y DEVUELVE su cantidad al stock.
  function deleteSale(saleId: number): void {
    const sale = sales.find((s) => s.id === saleId);
    if (!sale) return;
    const product = products.find((p) => p.id === sale.product_id);
    setSales((prev) => prev.filter((s) => s.id !== saleId));
    if (product) {
      const stock = product.stock + sale.quantity;
      setProducts((prev) => prev.map((p) => (p.id === sale.product_id ? { ...p, stock } : p)));
      persist(supabase.from('product').update({ stock }).eq('id', sale.product_id));
    }
    persist(supabase.from('sale').delete().eq('id', saleId));
  }

  function addProduct(input: ProductInput): void {
    const product: Product = { id: newId(), business_id: businessId, ...input };
    setProducts((prev) => [...prev, product]);
    persist(supabase.from('product').insert(product));
  }

  function updateProduct(id: number, patch: ProductPatch): void {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    persist(supabase.from('product').update(patch).eq('id', id));
  }

  // Solo se puede borrar un producto SIN ventas (preserva el historial de ventas).
  function deleteProduct(id: number): void {
    if (sales.some((s) => s.product_id === id)) return;
    setProducts((prev) => prev.filter((p) => p.id !== id));
    persist(supabase.from('product').delete().eq('id', id));
  }

  function restock(productId: number, units: number): void {
    if (units === 0) return;
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const stock = product.stock + units;
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, stock } : p)));
    persist(supabase.from('product').update({ stock }).eq('id', productId));
  }

  function registerSale(productId: number, quantity: number, overridePrice?: number): boolean {
    const product = products.find((p) => p.id === productId);
    if (!product || !canSell(product.stock, quantity)) return false;
    const sale: Sale = {
      id: newId(),
      business_id: businessId,
      product_id: productId,
      quantity,
      unit_price: overridePrice ?? product.price, // congelado
      unit_cost: product.cost, // congelado
      datetime: nowLocalDatetime(),
    };
    const stock = product.stock - quantity;
    setSales((prev) => [...prev, sale]);
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, stock } : p)));
    persist(supabase.from('sale').insert(sale));
    persist(supabase.from('product').update({ stock }).eq('id', productId));
    return true;
  }

  const inventory: Inventory = {
    products,
    salesReport,
    salesInPeriod,
    deleteSale,
    addProduct,
    updateProduct,
    deleteProduct,
    restock,
    registerSale,
  };
  return <InventoryContext.Provider value={inventory}>{children}</InventoryContext.Provider>;
}

export function useInventory(): Inventory {
  const inv = useContext(InventoryContext);
  if (inv === null) {
    throw new Error('useInventory debe usarse dentro de <InventoryProvider>.');
  }
  return inv;
}
