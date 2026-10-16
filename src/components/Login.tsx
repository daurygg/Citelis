// Pantalla de acceso: iniciar sesión o crear cuenta (email/contraseña).
// Antes de existir un negocio rige el color de marca por defecto (rosa de Citelis).
import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth/AuthContext';
import { signUpOutcome, validateSignUp, PASSWORD_MIN_LENGTH, type SignUpErrors } from '../lib/domain/onboarding';
import { btnGhost, btnPrimary, card, field, fieldLabel, input } from './ui';

type Mode = 'signin' | 'signup';

const errorText = 'text-sm text-red-600';
const inputInvalid = ' border-red-400';

// Selector segmentado Entrar / Crear cuenta (44px de alto).
function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const option = (value: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => onChange(value)}
      className={
        'min-h-11 flex-1 rounded-lg text-sm font-medium transition ' +
        (mode === value ? 'bg-white text-brand-700 shadow-sm' : 'text-neutral-600 hover:text-neutral-900')
      }
    >
      {label}
    </button>
  );
  return (
    <div role="tablist" className="mb-4 flex gap-1 rounded-xl bg-neutral-100 p-1">
      {option('signin', 'Entrar')}
      {option('signup', 'Crear cuenta')}
    </div>
  );
}

export function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<SignUpErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Correo al que se envió la confirmación (null = formulario normal).
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const isSignUp = mode === 'signup';
  const canSubmit = email.trim() !== '' && password !== '' && (!isSignUp || confirm !== '') && !busy;

  function changeMode(next: Mode) {
    setMode(next);
    setError(null);
    setFieldErrors({});
    setConfirm('');
  }

  function backToSignIn() {
    setPendingEmail(null);
    changeMode('signin');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);

    if (isSignUp) {
      const errors = validateSignUp({ email, password, confirm });
      setFieldErrors(errors);
      if (Object.keys(errors).length > 0) return;
    }

    setBusy(true);
    if (!isSignUp) {
      const { error: err } = await signIn(email.trim(), password);
      setBusy(false);
      if (err) setError(err);
      return;
    }

    const { error: err, hasSession } = await signUp(email.trim(), password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    // Con sesión, AuthContext ya la recogió y la app entra sola.
    if (signUpOutcome(hasSession) === 'confirm_email') setPendingEmail(email.trim());
  }

  return (
    <div className="min-h-dvh bg-neutral-50 px-4 py-8 sm:py-16 text-neutral-900">
      <div className="mx-auto max-w-sm">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-brand-700">Citelis</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Tu agenda, tus clientas y lo que realmente ganas, en un solo lugar.
          </p>
          {isSignUp && pendingEmail === null && (
            <p className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">
              Prueba gratis por 14 días, sin tarjeta.
            </p>
          )}
        </header>

        {pendingEmail !== null ? (
          <div className={card + ' flex flex-col gap-3 text-center'} role="status">
            <h2 className="text-lg font-semibold">Revisa tu correo</h2>
            <p className="text-sm text-neutral-600">
              Te enviamos un enlace de confirmación a{' '}
              <strong className="break-all text-neutral-900">{pendingEmail}</strong>. Ábrelo para activar tu cuenta y
              luego inicia sesión.
            </p>
            <p className="text-xs text-neutral-500">Si no lo ves, mira también en la carpeta de spam.</p>
            <button type="button" className={btnGhost} onClick={backToSignIn}>
              Volver a iniciar sesión
            </button>
          </div>
        ) : (
          <div className={card}>
            <ModeToggle mode={mode} onChange={changeMode} />
            <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
              <label className={field}>
                <span className={fieldLabel}>Correo</span>
                <input
                  className={input + (fieldErrors.email ? inputInvalid : '')}
                  type="email"
                  autoComplete="email"
                  value={email}
                  aria-invalid={fieldErrors.email ? true : undefined}
                  aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {fieldErrors.email && (
                  <span id="email-error" className={errorText}>
                    {fieldErrors.email}
                  </span>
                )}
              </label>

              <label className={field}>
                <span className={fieldLabel}>Contraseña</span>
                <input
                  className={input + (fieldErrors.password ? inputInvalid : '')}
                  type="password"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  value={password}
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={isSignUp ? 'password-hint' + (fieldErrors.password ? ' password-error' : '') : undefined}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {isSignUp && (
                  <span id="password-hint" className="text-xs text-neutral-500">
                    Mínimo {PASSWORD_MIN_LENGTH} caracteres.
                  </span>
                )}
                {fieldErrors.password && (
                  <span id="password-error" className={errorText}>
                    {fieldErrors.password}
                  </span>
                )}
              </label>

              {isSignUp && (
                <label className={field}>
                  <span className={fieldLabel}>Confirmar contraseña</span>
                  <input
                    className={input + (fieldErrors.confirm ? inputInvalid : '')}
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    aria-invalid={fieldErrors.confirm ? true : undefined}
                    aria-describedby={fieldErrors.confirm ? 'confirm-error' : undefined}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                  {fieldErrors.confirm && (
                    <span id="confirm-error" className={errorText}>
                      {fieldErrors.confirm}
                    </span>
                  )}
                </label>
              )}

              {error && (
                <p className={errorText} role="alert">
                  {error}
                </p>
              )}

              <button type="submit" className={btnPrimary} disabled={!canSubmit}>
                {busy ? 'Un momento…' : isSignUp ? 'Crear mi cuenta' : 'Entrar'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
