// Pantalla de acceso: iniciar sesión o crear cuenta (email/contraseña).
import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth/AuthContext';
import { btnPrimary, card, field, fieldLabel, input } from './ui';

export function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = email.trim() !== '' && password !== '' && !busy;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    const run = mode === 'signin' ? signIn : signUp;
    const { error: err } = await run(email.trim(), password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    if (mode === 'signup') {
      setNotice('Cuenta creada. Si te pide confirmar, revisa tu correo; si no, ya puedes iniciar sesión.');
      setMode('signin');
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-16 text-neutral-900">
      <div className="mx-auto max-w-sm">
        <h1 className="mb-1 text-center text-2xl font-bold text-rose-700">Citelis</h1>
        <p className="mb-6 text-center text-sm text-neutral-500">
          {mode === 'signin' ? 'Inicia sesión para continuar' : 'Crea tu cuenta'}
        </p>

        <form onSubmit={handleSubmit} className={card + ' flex flex-col gap-3'}>
          <label className={field}>
            <span className={fieldLabel}>Correo</span>
            <input
              className={input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className={field}>
            <span className={fieldLabel}>Contraseña</span>
            <input
              className={input}
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-green-700">{notice}</p>}

          <button type="submit" className={btnPrimary} disabled={!canSubmit}>
            {busy ? 'Un momento…' : mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-rose-700 hover:underline"
          onClick={() => {
            setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
            setError(null);
            setNotice(null);
          }}
        >
          {mode === 'signin' ? '¿No tienes cuenta? Crear una' : '¿Ya tienes cuenta? Inicia sesión'}
        </button>
      </div>
    </div>
  );
}
