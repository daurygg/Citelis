// Placeholder de UI. El Slice 0 es solo dominio puro (sin UI).
// Las pantallas reales llegan en el Slice 1.
export function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 640 }}>
      <h1>Citelis</h1>
      <p>Sistema de agenda y ganancias para servicios de belleza.</p>
      <p>
        <strong>Slice 0 — dominio puro</strong> listo. La interfaz llega en el Slice 1.
      </p>
    </main>
  );
}
