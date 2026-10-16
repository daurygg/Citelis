// Lógica pura del inicio guiado: validación del registro, del nombre del negocio
// y el modelo de pasos del asistente. La UI solo llama a estas funciones
// (INVARIANTE 5); los textos están en el lenguaje de la dueña (INVARIANTE 4).

export const PASSWORD_MIN_LENGTH = 8;
export const BUSINESS_NAME_MIN_LENGTH = 2;
export const BUSINESS_NAME_MAX_LENGTH = 60;

// Forma básica: algo@algo.algo, sin espacios. La verificación real la hace el
// correo de confirmación; aquí solo se atrapan los errores de tecleo evidentes.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SignUpInput {
  email: string;
  password: string;
  confirm: string;
}

export type SignUpErrors = Partial<Record<keyof SignUpInput, string>>;

/** Devuelve campo → mensaje, o un objeto vacío si el registro es válido. */
export function validateSignUp({ email, password, confirm }: SignUpInput): SignUpErrors {
  const errors: SignUpErrors = {};

  if (!EMAIL_SHAPE.test(email.trim())) {
    errors.email = 'Escribe un correo válido, por ejemplo ana@correo.com.';
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  } else if (confirm !== password) {
    errors.confirm = 'Las contraseñas no coinciden.';
  }

  return errors;
}

/** Devuelve el mensaje de error, o null si el nombre es válido. */
export function validateBusinessName(name: string): string | null {
  const length = name.trim().length;
  if (length < BUSINESS_NAME_MIN_LENGTH) return 'Escribe el nombre de tu negocio (mínimo 2 letras).';
  if (length > BUSINESS_NAME_MAX_LENGTH) return `El nombre es muy largo (máximo ${BUSINESS_NAME_MAX_LENGTH} caracteres).`;
  return null;
}

export type OnboardingStep = 'business' | 'hours' | 'service' | 'done';

export const ONBOARDING_STEPS: readonly OnboardingStep[] = ['business', 'hours', 'service', 'done'];

// Pasos con número en el indicador de progreso ("done" es la pantalla final).
const VISIBLE_STEPS: readonly OnboardingStep[] = ['business', 'hours', 'service'];

const SKIPPABLE: readonly OnboardingStep[] = ['hours', 'service'];

export function nextStep(step: OnboardingStep): OnboardingStep {
  const index = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)];
}

export function prevStep(step: OnboardingStep): OnboardingStep {
  const index = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[Math.max(index - 1, 0)];
}

export function isSkippable(step: OnboardingStep): boolean {
  return SKIPPABLE.includes(step);
}

/** Posición para "Paso 2 de 3". En "done" queda completo (3 de 3). */
export function stepProgress(step: OnboardingStep): { current: number; total: number } {
  const total = VISIBLE_STEPS.length;
  const index = VISIBLE_STEPS.indexOf(step);
  return { current: index === -1 ? total : index + 1, total };
}
