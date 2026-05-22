import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/authContext';
import { createCheckoutSession, createPortalSession } from '../lib/api';

export default function BillingPage() {
  const { me, refreshMe } = useAuth();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const success = params.get('success') === '1';
  const canceled = params.get('canceled') === '1';

  useEffect(() => {
    if (success) {
      // Stripe redirected back — webhook may have run before we got here.
      // Refresh /api/me to pick up the new tier.
      void refreshMe();
    }
  }, [success, refreshMe]);

  const onUpgrade = async () => {
    setBusy(true);
    setError(null);
    try {
      const url = await createCheckoutSession();
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const onManage = async () => {
    setBusy(true);
    setError(null);
    try {
      const url = await createPortalSession();
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const tier = me?.tier ?? 'free';
  const used = me?.chat_quota.used ?? 0;
  const limit = me?.chat_quota.limit;

  return (
    <div className="billing-page">
      <h1>Billing</h1>

      {success && (
        <div className="billing-banner billing-banner-success">
          Thanks for upgrading! Your subscription is active.
        </div>
      )}
      {canceled && (
        <div className="billing-banner billing-banner-info">
          Checkout canceled. You can try again anytime.
        </div>
      )}

      <section className="billing-card">
        <h2>Current plan</h2>
        <p className="billing-tier">
          <span className={`tier-badge tier-badge-${tier}`}>{tier.toUpperCase()}</span>
        </p>

        {tier === 'free' && (
          <>
            <p>
              Chat usage: <strong>{used}</strong> / {limit ?? '∞'} in the last 7 days.
            </p>
            <button type="button" className="billing-primary-btn" onClick={onUpgrade} disabled={busy}>
              {busy ? 'Loading…' : 'Upgrade to Paid'}
            </button>
          </>
        )}

        {tier === 'paid' && (
          <>
            <p>Unlimited chat usage. Manage your subscription below.</p>
            <button type="button" className="billing-secondary-btn" onClick={onManage} disabled={busy}>
              {busy ? 'Loading…' : 'Manage subscription'}
            </button>
          </>
        )}

        {error && <p className="billing-error">{error}</p>}
      </section>
    </div>
  );
}
