// Contrato de datos del módulo de ROPA (inventario físico). Separado de servicios
// (INVARIANTE 3: lógicas distintas, no se mezclan). Dinero en centavos enteros.

export interface Product {
  id: number;
  business_id: number; // INVARIANTE 1
  name: string;
  price: number; // centavos. Precio de venta
  cost: number; // centavos. Lo que le costó a la dueña
  stock: number; // unidades disponibles
}

export interface Sale {
  id: number;
  business_id: number; // INVARIANTE 1
  product_id: number;
  quantity: number;
  // CONGELADOS al vender (mismo principio de inmutabilidad que las citas):
  unit_price: number; // centavos, precio unitario cobrado
  unit_cost: number; // centavos, costo unitario del momento
  datetime: string; // ISO 8601
  client: string; // quién compró (necesario para fiado)
  paid: number; // centavos ya pagados; < total ⇒ venta a crédito (fiado)
}
