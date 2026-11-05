// Panel de administración de la plataforma (S6). Contenedor: pide la lista, registra pagos
// y cambia la exención a través de la capa de datos; las tarjetas son presentacionales.
// Solo se monta si `is_platform_admin()` es verdadero, y el servidor lo exige igual.
import { useCallback, useEffect, useState } from 'react';
import type { AdminBusiness, BusinessModule } from '../../lib/domain/types';
import { BUSINESS_MODULES } from '../../lib/domain/modules';
import type { PaymentArgs } from '../../lib/domain/subscriptionAdmin';
import { fetchAdminBusinesses, registerSubscriptionPayment, setBusinessExempt, setBusinessModule } from '../../lib/subscription/subscriptionApi';
import { useToast } from '../Toast';
import { btnGhost, rowDivider, screenTitle, surface } from '../ui';
import { AdminBusinessCard } from './AdminBusinessCard';

export function AdminPanel() {
  const { notify } = useToast();
  const [businesses, setBusinesses] = useState<AdminBusiness[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const result = await fetchAdminBusinesses();
    if (result.ok) {
      setBusinesses(result.businesses);
      setLoadError(null);
    } else {
      setLoadError(result.message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitPayment(businessId: number, args: PaymentArgs) {
    const result = await registerSubscriptionPayment(businessId, args);
    if (result.ok) {
      notify('✓ Pago registrado');
      setPayingId(null);
      await load();
    }
    return result;
  }

  async function toggleExempt(b: AdminBusiness) {
    setBusyId(b.business_id);
    const result = await setBusinessExempt(b.business_id, !b.exempt);
    setBusyId(null);
    if (result.ok) {
      notify(b.exempt ? '✓ Exención quitada' : '✓ Negocio exento');
      await load();
    } else {
      notify(result.message, 'error');
    }
  }

  async function toggleModule(b: AdminBusiness, module: BusinessModule) {
    const enabled = !(module === 'store' ? b.store_enabled : b.team_enabled);
    const label = BUSINESS_MODULES.find((m) => m.id === module)?.label ?? module;
    setBusyId(b.business_id);
    const result = await setBusinessModule(b.business_id, module, enabled);
    setBusyId(null);
    if (result.ok) {
      notify(enabled ? `✓ ${label} activado` : `${label} desactivado`);
      await load();
    } else {
      notify(result.message, 'error');
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className={screenTitle}>Negocios y pagos</h2>
      {loadError && (
        <div role="alert" className="flex flex-col gap-2 text-sm text-red-700">
          <p>{loadError}</p>
          <button type="button" className={btnGhost} onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}
      {businesses === null && !loadError && <p className="text-muted">Cargando…</p>}
      {businesses?.length === 0 && <p className="text-muted">Todavía no hay negocios.</p>}
      <ul className={(businesses && businesses.length > 0 ? surface + ' ' : '') + rowDivider}>
        {businesses?.map((b) => (
          <AdminBusinessCard
            key={b.business_id}
            business={b}
            paying={payingId === b.business_id}
            busy={busyId === b.business_id}
            onStartPayment={() => setPayingId(b.business_id)}
            onCancelPayment={() => setPayingId(null)}
            onSubmitPayment={(args) => submitPayment(b.business_id, args)}
            onToggleExempt={() => void toggleExempt(b)}
            onToggleModule={(module) => void toggleModule(b, module)}
          />
        ))}
      </ul>
    </section>
  );
}
