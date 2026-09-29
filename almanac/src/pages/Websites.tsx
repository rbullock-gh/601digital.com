import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Globe, Trash2 } from 'lucide-react';
import { api, refreshAll } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useUI } from '../lib/ui.tsx';
import { useDocumentTitle } from '../lib/hooks.ts';
import { money, shortDate } from '../lib/format.ts';
import { Card, Empty, ErrorBox, Meter, PageHead, PageSkeleton, Stat } from '../components/ui/primitives.tsx';
import { Dialog } from '../components/ui/Dialog.tsx';
import { Field, MoneyInput, toCents } from '../features/forms.tsx';
import type { WebsiteSale, WebsiteSummary } from '../../shared/types.ts';

const centsStr = (c: number) => (c / 100).toFixed(c % 100 ? 2 : 0);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export default function Websites() {
  const ui = useUI();
  useDocumentTitle('Website Sales');
  const q = useQuery({ queryKey: ['websites'], queryFn: () => api.get<WebsiteSummary>('/websites') });
  const [editing, setEditing] = useState<WebsiteSale | null>(null);

  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const s = q.data;
  const bySlot = new Map(s.sales.map((x) => [x.slot, x]));
  const terms = `${s.defaults.downCents ? `${money(s.defaults.downCents)} down` : 'No down payment'}, ${money(s.defaults.monthlyCents)} a month`;

  const markSold = async (slot: number) => {
    try {
      await api.put(`/websites/${slot}`, {});
      await refreshAll();
      ui.toast(`Website ${slot} sold · ${money(s.defaults.monthlyCents)}/mo`, {
        tone: 'success',
        action: {
          label: 'Undo',
          run: async () => {
            try {
              await api.del(`/websites/${slot}`);
              await refreshAll();
            } catch (e) {
              ui.error(e);
            }
          },
        },
      });
    } catch (e) {
      ui.error(e);
    }
  };

  return (
    <div className="page">
      <PageHead title="Website Sales" sub={`Check off a square for each website sold. ${terms}.`} />

      <div className="stack-16">
        <div className="card">
          <div className="stat-row" style={{ '--cols': 4 } as React.CSSProperties}>
            <Stat label="Sold" value={`${s.sold} / ${s.slots}`} foot={`${plural(s.slots - s.sold, 'square')} left`} />
            <Stat label="Monthly" value={money(s.monthlyCents)} foot={s.sold ? 'recurring, every month' : 'nothing sold yet'} />
            <Stat label="Yearly" value={money(s.yearlyCents)} foot="at the current monthly" />
            <Stat label="Collected so far" value={money(s.collectedCents)} foot="down payments + monthly payments due to date" />
          </div>
        </div>

        <Card
          title="Board"
          sub="Click an empty square to mark it sold. Click a sold one to edit it."
          actions={<span className="faint num" style={{ fontSize: 12 }}>{money(s.monthlyCents)} of {money(s.fullBoardMonthlyCents)}/mo</span>}
        >
          <div className="ws-board" style={{ '--cols': s.cols } as React.CSSProperties} role="group" aria-label="Website sales board">
            {Array.from({ length: s.slots }, (_, i) => {
              const slot = i + 1;
              const sale = bySlot.get(slot);
              return (
                <button
                  key={slot}
                  type="button"
                  className={`ws-cell ${sale ? 'sold' : ''}`}
                  aria-pressed={!!sale}
                  aria-label={sale ? `Website ${slot}, sold${sale.client ? ` to ${sale.client}` : ''} on ${shortDate(sale.soldOn, true)}` : `Website ${slot}, not sold`}
                  title={sale ? [sale.client, `Sold ${shortDate(sale.soldOn, true)}`, `${money(sale.monthlyCents)}/mo`].filter(Boolean).join(' · ') : 'Mark as sold'}
                  onClick={() => (sale ? setEditing(sale) : markSold(slot))}
                >
                  <span className="ws-num num">{slot}</span>
                  {sale ? <Check className="ws-check" /> : null}
                  {sale?.client && <span className="ws-client truncate">{sale.client}</span>}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 16 }}>
            <Meter value={s.sold / s.slots} color="var(--money)" done={s.sold === s.slots} label="Board filled" />
          </div>
        </Card>

        <Card flush title="Sales" sub={s.sold ? plural(s.sold, 'website') : undefined}>
          {s.sales.length ? (
            <div className="ws-list">
              {s.sales.map((x) => (
                <button key={x.slot} className="session-row ws-row" onClick={() => setEditing(x)}>
                  <span className="sr-time num">#{x.slot}</span>
                  <span className="sr-main">
                    <span className="title">{x.client ?? `Website ${x.slot}`}</span>
                    <span className="sr-meta">
                      Sold {shortDate(x.soldOn, true)} · {x.downCents ? `${money(x.downCents)} down · ` : ''}
                      {money(x.monthlyCents)}/mo · {plural(x.payments, 'payment')} due
                    </span>
                  </span>
                  <span className="num pos">{money(x.collectedCents)}</span>
                </button>
              ))}
            </div>
          ) : (
            <Empty icon={<Globe />} title="No websites sold yet">
              Check off the first square on the board when you close a sale.
            </Empty>
          )}
        </Card>
      </div>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing ? `Website ${editing.slot}` : ''} width={440}>
        {editing && <SaleForm key={editing.slot} sale={editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function SaleForm({ sale, onDone }: { sale: WebsiteSale; onDone: () => void }) {
  const ui = useUI();
  const boot = useBoot();
  const [client, setClient] = useState(sale.client ?? '');
  const [soldOn, setSoldOn] = useState(sale.soldOn);
  const [down, setDown] = useState(centsStr(sale.downCents));
  const [monthly, setMonthly] = useState(centsStr(sale.monthlyCents));
  const [notes, setNotes] = useState(sale.notes ?? '');
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/websites/${sale.slot}`, { client, soldOn, downCents: toCents(down) ?? 0, monthlyCents: toCents(monthly) ?? 0, notes });
      await refreshAll();
      ui.toast('Sale saved', { tone: 'success' });
      onDone();
    } catch (err) {
      ui.error(err);
    } finally {
      setBusy(false);
    }
  };
  const unmark = async () => {
    const ok = await ui.confirm({ title: `Unmark website ${sale.slot}?`, body: 'The square goes back to empty and its payments stop counting.', confirm: 'Unmark', danger: true });
    if (!ok) return;
    try {
      await api.del(`/websites/${sale.slot}`);
      await refreshAll();
      ui.toast(`Website ${sale.slot} unmarked`);
      onDone();
    } catch (err) {
      ui.error(err);
    }
  };

  return (
    <form className="stack-16" onSubmit={save}>
      <Field label="Client" htmlFor="ws-client">
        <input id="ws-client" className="input" value={client} placeholder="Optional" maxLength={80} onChange={(e) => setClient(e.target.value)} />
      </Field>
      <Field label="Sold on" htmlFor="ws-sold">
        <input id="ws-sold" type="date" className="input" value={soldOn} max={boot.today} onChange={(e) => setSoldOn(e.target.value)} required />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Down payment" htmlFor="ws-down">
          <MoneyInput id="ws-down" value={down} onChange={setDown} placeholder="0" />
        </Field>
        <Field label="Monthly" htmlFor="ws-monthly">
          <MoneyInput id="ws-monthly" value={monthly} onChange={setMonthly} placeholder="200" />
        </Field>
      </div>
      <Field label="Notes" htmlFor="ws-notes">
        <textarea id="ws-notes" className="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="faint" style={{ fontSize: 12 }}>
        {plural(sale.payments, 'monthly payment')} due so far · {money(sale.collectedCents)} collected
      </div>
      <div className="form-foot">
        <button type="button" className="btn btn-ghost btn-danger" style={{ marginRight: 'auto' }} onClick={unmark}>
          <Trash2 /> Unmark
        </button>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Save
        </button>
      </div>
    </form>
  );
}
