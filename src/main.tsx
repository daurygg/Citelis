import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Registro del service worker (T4): sin esto Citelis no es instalable y no
// puede recibir Web Push. Se hace tras `load` para no competir con el primer
// render, y una falla acá no puede tumbar la app (INVARIANTE 5 es de dominio,
// pero el espíritu aplica: un aviso roto nunca bloquea el negocio).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
      console.warn('No se pudo registrar el service worker:', err);
    });
  });
}
