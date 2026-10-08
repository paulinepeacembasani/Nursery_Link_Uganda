import { isApiError } from '@nurserylink/api-client';
import { Button, ErrorState, SkeletonList, cn, formatCount, formatPhone, formatUGX } from '@nurserylink/ui';
import { ArrowLeft, Check } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { usePageTitle } from '../components/usePageTitle';
import { en } from '../copy/en';
import { usePlaceOrder } from '../features/orders/api';
import { StepDelivery, type DeliveryErrors } from '../features/orders/checkout/StepDelivery';
import { StepPay, type Change } from '../features/orders/checkout/StepPay';
import { StepSeedlings } from '../features/orders/checkout/StepSeedlings';
import { chosenItems, useOrderDraft } from '../features/orders/draft';
import { useNurseryProfile } from '../features/nurseries/api';
import { signOut, useUser } from '../lib/session';

const STEPS = ['seedlings', 'delivery', 'pay'] as const;
type Step = (typeof STEPS)[number];

const Progress = ({ step }: { step: Step }) => {
  const current = STEPS.indexOf(step);
  return (
    <ol aria-label={en.checkout.stepOf(current + 1, STEPS.length)} className="flex items-center gap-2">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === current ? 'step' : undefined} className="flex flex-1 items-center gap-2">
          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold', i < current ? 'bg-seedling text-paper' : i === current ? 'bg-forest text-paper' : 'bg-paper text-bark-muted ring-1 ring-field')}>
            {i < current ? <Check aria-hidden className="size-4" /> : i + 1}
          </span>
          <span className={cn('text-sm font-bold', i === current ? 'text-canopy' : 'text-bark-muted')}>{en.checkout.steps[s]}</span>
          {i < STEPS.length - 1 && <span aria-hidden className="h-0.5 flex-1 bg-line" />}
        </li>
      ))}
    </ol>
  );
};

/** Order: seedlings → delivery → quote and pay (FR-12–FR-14, FR-25). */
const Checkout = () => {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const step: Step = STEPS.find(s => s === params.get('step')) ?? 'seedlings';
  const navigate = useNavigate();
  const user = useUser();
  const profile = useNurseryProfile(id, null);
  const nursery = profile.data?.data;
  const { draft, update } = useOrderDraft(id);
  // Errors show once the buyer tries to continue, and disappear as soon as the field is fixed
  const [triedItems, setTriedItems] = useState(false);
  const [triedDelivery, setTriedDelivery] = useState(false);
  const [changes, setChanges] = useState<Change[]>([]);
  const [payError, setPayError] = useState<string | null>(null);
  const placeOrder = usePlaceOrder();
  usePageTitle(nursery ? en.checkout.title(nursery.name) : undefined);

  // The paying number starts as the buyer's own
  useEffect(() => {
    if (!draft.payer && user) update({ payer: formatPhone(user.phone) });
  }, [draft.payer, user, update]);


  const go = (s: Step) => { setParams({ step: s }); };

  const itemsError = triedItems && chosenItems(draft).length === 0 ? en.checkout.chooseSome : null;
  // FR-25: a delivery needs a point and an address the rider can follow
  const deliveryProblems: DeliveryErrors =
    draft.deliveryType === 'order_and_deliver'
      ? {
          ...(draft.point ? {} : { point: en.checkout.pinMissing }),
          ...(draft.address.trim().length >= 5 ? {} : { address: en.checkout.addressMissing }),
        }
      : {};
  const deliveryErrors: DeliveryErrors = triedDelivery ? deliveryProblems : {};
  const nameOf = useCallback((inventoryId: string) => nursery?.inventory.find(i => i.inventory_id === inventoryId)?.species.common_name ?? '', [nursery]);

  /** Caps quantities to what is left (or removes items no longer sold) and says what changed. */
  const applyChanges = useCallback(
    (details: unknown) => {
      if (!Array.isArray(details)) return;
      const quantities = { ...draft.quantities };
      const notes: Change[] = [];
      for (const d of details as { inventory_id?: string; reason?: string; available?: number; quoted?: number; now?: number }[]) {
        if (!d.inventory_id) continue;
        const name = nameOf(d.inventory_id);
        if (d.reason === 'price_changed' && d.quoted !== undefined && d.now !== undefined) {
          notes.push({ inventoryId: d.inventory_id, text: en.checkout.changedPrice(name, formatUGX(d.quoted), formatUGX(d.now)) });
        } else if (d.available !== undefined && d.available > 0) {
          quantities[d.inventory_id] = Math.min(quantities[d.inventory_id] ?? 0, d.available);
          notes.push({ inventoryId: d.inventory_id, text: en.checkout.changedStock(name, formatCount(d.available)) });
        } else {
          quantities[d.inventory_id] = 0;
          notes.push({ inventoryId: d.inventory_id, text: en.checkout.changedGone(name) });
        }
      }
      setChanges(notes);
      update({ quantities });
      // Fresh stock levels for the steppers
      void profile.refetch();
    },
    [draft.quantities, nameOf, update, profile]
  );

  // Only buyer accounts can order (the API refuses admins): say so up front, not at the last step
  if (user?.role === 'admin') {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <h1 className="text-2xl">{en.checkout.adminTitle}</h1>
        <p className="rounded-md bg-amber-tint px-4 py-3 text-bark ring-1 ring-amber/30">{en.checkout.adminBody}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { void signOut().then(() => navigate(`/login?next=${encodeURIComponent(`/nurseries/${id}/order`)}`)); }}>
            {en.checkout.adminSwitch}
          </Button>
          <Button asChild variant="secondary"><Link to={`/nurseries?nursery=${id}`}>{en.checkout.back}</Link></Button>
        </div>
      </div>
    );
  }
  if (profile.isPending) return <SkeletonList rows={4} />;
  if (!nursery) {
    const offline = isApiError(profile.error) && profile.error.isOffline;
    return <ErrorState title={offline ? en.states.offlineNoCache : en.nurseryCard.loadFailed} offline={offline} onRetry={() => { void profile.refetch(); }} retryLabel={en.states.retry} />;
  }

  const next = () => {
    if (step === 'seedlings') {
      setTriedItems(true);
      if (chosenItems(draft).length > 0) go('delivery');
    } else if (step === 'delivery') {
      setTriedDelivery(true);
      if (!deliveryProblems.point && !deliveryProblems.address) go('pay');
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link to={`/nurseries?nursery=${nursery.id}`} className="flex min-h-11 items-center gap-2 self-start font-bold">
        <ArrowLeft aria-hidden className="size-5" />
        {en.checkout.back}
      </Link>
      <h1 className="text-2xl">{en.checkout.title(nursery.name)}</h1>
      <Progress step={step} />

      {step === 'seedlings' && (
        <StepSeedlings inventory={nursery.inventory} draft={draft} error={itemsError} onChange={quantities => { update({ quantities }); setChanges([]); }} />
      )}
      {step === 'delivery' && <StepDelivery draft={draft} update={update} nursery={{ name: nursery.name, location: nursery.location }} errors={deliveryErrors} />}
      {step === 'pay' && (
        <StepPay
          nurseryId={nursery.id}
          draft={draft}
          update={update}
          changes={changes}
          paying={placeOrder.isPending}
          payError={payError}
          onStockConflict={applyChanges}
          onPay={(quote, method, payer) => {
            setPayError(null);
            placeOrder.mutate(
              {
                quote_token: quote.quote_token,
                ...(method && payer ? { payment_method: method, payer_phone: payer } : {}),
                ...(draft.deliveryType === 'order_and_deliver' ? { delivery_address: draft.address.trim() } : {}),
              },
              {
                onSuccess: order => {
                  void navigate(`/orders/${order.id}`, { replace: true, state: { from: 'checkout', nurseryId: nursery.id } });
                },
                onError: err => {
                  if (isApiError(err) && err.status === 409) {
                    // Prices or stock moved, or the quote was already used: explain and re-quote
                    applyChanges(err.details);
                    if (!Array.isArray(err.details)) setPayError(err.message);
                    return;
                  }
                  setPayError(isApiError(err) ? err.message : en.checkout.payFailed);
                },
              }
            );
          }}
        />
      )}

      {/* Phones: Next stays at the bottom of the screen, in thumb reach, however long the tree list is */}
      {step !== 'pay' && (
        <div className="sticky bottom-0 z-20 -mx-4 flex gap-2 border-t border-line bg-mist/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          {step === 'delivery' && <Button variant="secondary" onClick={() => { go('seedlings'); }}>{en.checkout.backStep}</Button>}
          <Button size="lg" className="flex-1" onClick={next}>{en.checkout.next}</Button>
        </div>
      )}
      {step === 'pay' && <Button variant="ghost" className="self-start" onClick={() => { go('delivery'); }}>{en.checkout.backStep}</Button>}
    </div>
  );
};
export default Checkout;
