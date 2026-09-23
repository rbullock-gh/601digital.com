// Entry forms. Each is small, keyboard-friendly, and remembers what you use:
// projects, categories and rates come pre-filled from history.

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Star, Trash2 } from 'lucide-react';
import { api, refreshAll } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useUI } from '../lib/ui.tsx';
import {
  currencySymbol,
  duration,
  lFromDisplay,
  lUnit,
  lVal,
  money,
  wFromDisplay,
  wUnit,
  wVal,
  RATING_LABEL,
} from '../lib/format.ts';
import { Combobox, type ComboOption } from '../components/ui/Combobox.tsx';
import { Segmented } from '../components/ui/Segmented.tsx';
import { isClock, localTime, spanMinutes, type ISODate } from '../../shared/dates.ts';
import {
  MEASUREMENTS,
  MEASUREMENT_LABELS,
  type BodyMetric,
  type GoalInput,
  type GoalMetric,
  type GoalPeriod,
  type Income,
  type Project,
  type Rating,
  type WorkSession,
} from '../../shared/types.ts';

// ── Shared bits ──────────────────────────────────────────────────────────────

export function Field({ label, hint, children, className, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function MoneyInput({ value, onChange, placeholder, id, autoFocus, large }: { value: string; onChange: (v: string) => void; placeholder?: string; id?: string; autoFocus?: boolean; large?: boolean }) {
  return (
    <div className="input-affix">
      <span className="affix">{currencySymbol()}</span>
      <input
        id={id}
        className={`input num ${large ? 'input-lg' : ''}`}
        style={large ? { paddingLeft: 28 } : undefined}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ''))}
      />
    </div>
  );
}

export const toCents = (s: string): number | null => {
  const v = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(v) ? Math.round(v * 100) : null;
};
const centsStr = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(c % 100 ? 2 : 0));

function useProjectOptions(): ComboOption[] {
  const boot = useBoot();
  return useMemo(
    () =>
      boot.projects
        .filter((p) => p.status !== 'archived')
        .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'))
        .map((p) => ({ id: p.id, label: p.name, color: p.color, hint: p.status !== 'active' ? p.status : p.client ?? undefined })),
    [boot.projects],
  );
}
function useCategoryOptions(): ComboOption[] {
  const boot = useBoot();
  return useMemo(() => boot.categories.map((c) => ({ id: c.id, label: c.name })), [boot.categories]);
}

function FormFoot({ children }: { children: ReactNode }) {
  return <div className="form-foot">{children}</div>;
}

// ── Work session ─────────────────────────────────────────────────────────────

export interface WorkPreset {
  date?: ISODate;
  projectName?: string;
  categoryName?: string;
  description?: string;
  minutes?: number;
}

export function WorkSessionForm({ session, preset, onDone }: { session?: WorkSession; preset?: WorkPreset; onDone: () => void }) {
  const boot = useBoot();
  const ui = useUI();
  const projects = useProjectOptions();
  const categories = useCategoryOptions();
  const last = useQuery({
    queryKey: ['work', 'last'],
    queryFn: () => api.get<{ sessions: WorkSession[] }>('/work/sessions?limit=1'),
    enabled: !session,
  }).data?.sessions[0];

  const [date, setDate] = useState(session?.date ?? preset?.date ?? boot.today);
  const [mode, setMode] = useState<'times' | 'duration'>(session ? (session.startTime ? 'times' : 'duration') : preset?.minutes ? 'duration' : 'times');
  const nowT = localTime();
  const defaultStart = (() => {
    const [h, m] = nowT.split(':').map(Number);
    const t = Math.max(0, h * 60 + m - 120);
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor((t % 60) / 15) * 15).padStart(2, '0')}`;
  })();
  const [start, setStart] = useState(session?.startTime ?? defaultStart);
  const [end, setEnd] = useState(session?.endTime ?? nowT);
  const [brk, setBrk] = useState(String(session?.breakMinutes ?? 0));
  const [durH, setDurH] = useState(session && !session.startTime ? String(Math.floor(session.minutes / 60)) : preset?.minutes ? String(Math.floor(preset.minutes / 60)) : '');
  const [durM, setDurM] = useState(session && !session.startTime ? String(session.minutes % 60) : preset?.minutes ? String(preset.minutes % 60) : '');
  const [project, setProject] = useState(session?.projectName ?? preset?.projectName ?? '');
  const [projectTouched, setProjectTouched] = useState(false);
  const [category, setCategory] = useState(session?.categoryName ?? preset?.categoryName ?? '');
  const [description, setDescription] = useState(session?.description ?? preset?.description ?? '');
  const [payType, setPayType] = useState<WorkSession['payType']>(session?.payType ?? 'hourly');
  const [rate, setRate] = useState(session?.payType === 'hourly' ? centsStr(session.hourlyRateCents) : '');
  const [flat, setFlat] = useState(centsStr(session?.flatAmountCents));
  const [notes, setNotes] = useState(session?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Remember the last project/category for new sessions.
  const effProject = !session && !projectTouched && !project && last?.projectName ? last.projectName : project;
  const effCategory = !session && !category && !projectTouched && last?.categoryName && effProject === last?.projectName ? last.categoryName : category;

  const minutes =
    mode === 'times'
      ? isClock(start) && isClock(end)
        ? spanMinutes(start, end) - (Number(brk) || 0)
        : 0
      : (Number(durH) || 0) * 60 + (Number(durM) || 0);
  const proj: Project | undefined = boot.projects.find((p) => p.name.toLowerCase() === effProject.trim().toLowerCase());
  const impliedRate = proj?.hourlyRateCents ?? boot.settings.defaultRateCents;
  const rateCents = toCents(rate) ?? impliedRate;
  const earned = payType === 'hourly' ? Math.round((Math.max(0, minutes) * rateCents) / 60) : payType === 'flat' ? toCents(flat) ?? 0 : 0;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setErr(null);
    if (minutes <= 0) return setErr(mode === 'times' ? 'End time must be after the start time' : 'Enter how long you worked');
    setBusy(true);
    const body = {
      date,
      startTime: mode === 'times' ? start : null,
      endTime: mode === 'times' ? end : null,
      breakMinutes: mode === 'times' ? Number(brk) || 0 : 0,
      minutes: mode === 'duration' ? minutes : null,
      projectName: effProject.trim() || null,
      categoryName: effCategory.trim() || null,
      description: description.trim() || null,
      payType,
      hourlyRateCents: payType === 'hourly' ? (rate.trim() ? toCents(rate) : null) : null,
      flatAmountCents: payType === 'flat' ? toCents(flat) : null,
      notes: notes.trim() || null,
    };
    try {
      if (session) await api.put(`/work/sessions/${session.id}`, body);
      else await api.post('/work/sessions', body);
      await refreshAll();
      ui.toast(session ? 'Session updated' : `Logged ${duration(minutes)}${earned ? ` · ${money(earned)}` : ''}`, { tone: 'success' });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!session) return;
    try {
      await api.del(`/work/sessions/${session.id}`);
      ui.deleted('Work session', 'work_sessions', session.id);
      onDone();
    } catch (e) {
      ui.error(e);
    }
  };

  return (
    <form onSubmit={submit} className="stack-16">
      <Field label="What did you work on?" htmlFor="ws-desc">
        <input id="ws-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Homepage hero section" data-autofocus />
      </Field>
      <div className="form-grid">
        <Field label="Project" htmlFor="ws-proj">
          <Combobox
            id="ws-proj"
            value={effProject}
            onChange={(t) => {
              setProject(t);
              setProjectTouched(true);
            }}
            options={projects}
            placeholder="Optional"
          />
        </Field>
        <Field label="Category" htmlFor="ws-cat">
          <Combobox id="ws-cat" value={effCategory} onChange={(t) => setCategory(t)} options={categories} placeholder="Design, SEO…" />
        </Field>
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="field-label">Time</span>
        <Segmented
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'times', label: 'Start & end' },
            { value: 'duration', label: 'Duration' },
          ]}
        />
      </div>
      <div className="form-grid-3 time-grid">
        <Field label="Date" htmlFor="ws-date">
          <input id="ws-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        {mode === 'times' ? (
          <>
            <Field label="Start" htmlFor="ws-start">
              <input id="ws-start" type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="End" htmlFor="ws-end">
              <input id="ws-end" type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
            <Field label="Break (min)" htmlFor="ws-break">
              <input id="ws-break" className="input num" inputMode="numeric" value={brk} onChange={(e) => setBrk(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Hours" htmlFor="ws-h">
              <input id="ws-h" className="input num" inputMode="numeric" value={durH} onChange={(e) => setDurH(e.target.value.replace(/\D/g, ''))} placeholder="0" />
            </Field>
            <Field label="Minutes" htmlFor="ws-m">
              <input id="ws-m" className="input num" inputMode="numeric" value={durM} onChange={(e) => setDurM(e.target.value.replace(/\D/g, ''))} placeholder="0" />
            </Field>
          </>
        )}
      </div>
      <div className="stack-8">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="field-label">Pay</span>
          <Segmented
            size="sm"
            value={payType}
            onChange={setPayType}
            options={[
              { value: 'hourly', label: 'Hourly' },
              { value: 'flat', label: 'Flat rate' },
              { value: 'unpaid', label: 'Unpaid' },
            ]}
          />
        </div>
        {payType === 'hourly' && (
          <div className="input-affix has-right">
            <span className="affix">{currencySymbol()}</span>
            <input className="input num" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={centsStr(impliedRate)} aria-label="Hourly rate" />
            <span className="affix-r">/ hour</span>
          </div>
        )}
        {payType === 'flat' && <MoneyInput value={flat} onChange={setFlat} placeholder="0" />}
        {payType === 'hourly' && !rate && (
          <div className="field-hint">{proj?.hourlyRateCents ? `Using ${proj.name}’s rate` : 'Using your default rate'} — type to override for this session.</div>
        )}
      </div>
      <Field label="Notes" htmlFor="ws-notes">
        <textarea id="ws-notes" className="textarea" rows={2} style={{ minHeight: 60 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </Field>
      <div className="summary-strip">
        <div>
          <div className="eyebrow">Total time</div>
          <div className="v num">{minutes > 0 ? duration(minutes) : '—'}</div>
        </div>
        <div>
          <div className="eyebrow">Earned</div>
          <div className="v num">{money(earned)}</div>
        </div>
        <div>
          <div className="eyebrow">Effective rate</div>
          <div className="v num">{minutes > 0 && earned ? `${money(Math.round((earned * 60) / minutes))}/h` : '—'}</div>
        </div>
      </div>
      {err && <div className="field-error">{err}</div>}
      <FormFoot>
        {session && (
          <button type="button" className="btn btn-ghost left" onClick={remove}>
            <Trash2 /> Delete
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {session ? 'Save changes' : 'Log session'}
        </button>
      </FormFoot>
    </form>
  );
}

// ── Income ──────────────────────────────────────────────────────────────────

export function IncomeForm({ income, onDone, preset }: { income?: Income; onDone: () => void; preset?: { date?: ISODate } }) {
  const boot = useBoot();
  const ui = useUI();
  const projects = useProjectOptions();
  const [amount, setAmount] = useState(centsStr(income?.amountCents));
  const [source, setSource] = useState(income?.source ?? '');
  const [kind, setKind] = useState<Income['kind']>(income?.kind ?? 'project');
  const [project, setProject] = useState(income?.projectName ?? '');
  const [date, setDate] = useState(income?.date ?? preset?.date ?? boot.today);
  const [notes, setNotes] = useState(income?.notes ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setErr(null);
    const cents = toCents(amount);
    if (!cents || cents <= 0) return setErr('Enter an amount');
    setBusy(true);
    const body = { date, amountCents: cents, source: source.trim() || (project.trim() ? `${project.trim()} payment` : 'Income'), kind, projectName: project.trim() || null, notes: notes.trim() || null };
    try {
      if (income) await api.put(`/income/${income.id}`, body);
      else await api.post('/income', body);
      await refreshAll();
      ui.toast(income ? 'Income updated' : `${money(cents)} added`, { tone: 'success' });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!income) return;
    await api.del(`/income/${income.id}`);
    ui.deleted('Income', 'income', income.id);
    onDone();
  };

  return (
    <form onSubmit={submit} className="stack-16">
      <Field label="Amount" htmlFor="inc-amt">
        <MoneyInput id="inc-amt" value={amount} onChange={setAmount} placeholder="0" large />
      </Field>
      <Segmented
        block
        value={kind}
        onChange={setKind}
        options={[
          { value: 'project', label: 'Project' },
          { value: 'flat', label: 'Flat-rate job' },
          { value: 'other', label: 'Other income' },
        ]}
      />
      <Field label="From" htmlFor="inc-src">
        <input id="inc-src" className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder={kind === 'other' ? 'Sold old camera lens' : 'Launch milestone payment'} />
      </Field>
      <div className="form-grid">
        <Field label="Project" htmlFor="inc-proj">
          <Combobox id="inc-proj" value={project} onChange={(t) => setProject(t)} options={projects} placeholder="Optional" />
        </Field>
        <Field label="Date" htmlFor="inc-date">
          <input id="inc-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Notes" htmlFor="inc-notes">
        <input id="inc-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </Field>
      <div className="callout">
        <span>Hours you logged as work sessions are already counted. Use this for money that isn’t tied to logged time — payments, retainers, anything else.</span>
      </div>
      {err && <div className="field-error">{err}</div>}
      <FormFoot>
        {income && (
          <button type="button" className="btn btn-ghost left" onClick={remove}>
            <Trash2 /> Delete
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {income ? 'Save changes' : 'Add income'}
        </button>
      </FormFoot>
    </form>
  );
}

// ── Body: weight & measurements ─────────────────────────────────────────────

export function BodyForm({ entry, weightOnly, onDone, preset }: { entry?: BodyMetric; weightOnly?: boolean; onDone: () => void; preset?: { date?: ISODate } }) {
  const boot = useBoot();
  const ui = useUI();
  const [date, setDate] = useState(entry?.date ?? preset?.date ?? boot.today);
  const [weight, setWeight] = useState(entry?.weightKg != null ? String(wVal(entry.weightKg)) : '');
  const [bf, setBf] = useState(entry?.bodyFatPct != null ? String(entry.bodyFatPct) : '');
  const [m, setM] = useState<Record<string, string>>(() =>
    Object.fromEntries(MEASUREMENTS.map((k) => [k, entry?.[k] != null ? String(lVal(entry[k])) : ''])),
  );
  const [showMore, setShowMore] = useState(!weightOnly || MEASUREMENTS.some((k) => entry?.[k] != null));
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useQuery({ queryKey: ['body-latest'], queryFn: () => api.get<BodyMetric[]>('/body'), enabled: !entry }).data;
  const lastWeight = latest?.find((b) => b.weightKg != null);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setErr(null);
    const n = (s: string) => (s.trim() ? Number(s) : null);
    const body: Record<string, unknown> = {
      date,
      weightKg: n(weight) != null ? wFromDisplay(n(weight)!) : null,
      bodyFatPct: n(bf),
      notes: notes.trim() || null,
    };
    for (const k of MEASUREMENTS) body[k] = n(m[k]) != null ? lFromDisplay(n(m[k])!) : null;
    if (Object.entries(body).every(([k, v]) => k === 'date' || k === 'notes' || v == null)) return setErr('Enter at least one value');
    setBusy(true);
    try {
      if (entry) await api.put(`/body/${entry.id}`, body);
      else await api.post('/body', body);
      await refreshAll();
      ui.toast(entry ? 'Entry updated' : 'Logged', { tone: 'success' });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!entry) return;
    await api.del(`/body/${entry.id}`);
    ui.deleted('Body entry', 'body_metrics', entry.id);
    onDone();
  };

  return (
    <form onSubmit={submit} className="stack-16">
      <div className="form-grid">
        <Field label="Weight" htmlFor="b-w" hint={lastWeight ? `Last: ${wVal(lastWeight.weightKg)} ${wUnit()}` : undefined}>
          <div className="input-affix has-right">
            <input id="b-w" className="input input-lg num" style={{ paddingLeft: 12 }} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.0" data-autofocus />
            <span className="affix-r">{wUnit()}</span>
          </div>
        </Field>
        <Field label="Date" htmlFor="b-date">
          <input id="b-date" type="date" className="input" style={{ height: 48 }} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {!showMore ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowMore(true)}>
          + Add measurements
        </button>
      ) : (
        <div className="stack-8">
          <div className="field-label">Measurements ({lUnit()}) — all optional</div>
          <div className="form-grid-3">
            {MEASUREMENTS.map((k) => (
              <Field key={k} label={MEASUREMENT_LABELS[k]} htmlFor={`b-${k}`}>
                <input id={`b-${k}`} className="input num" inputMode="decimal" value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value.replace(/[^0-9.]/g, '') })} />
              </Field>
            ))}
            <Field label="Body fat %" htmlFor="b-bf">
              <input id="b-bf" className="input num" inputMode="decimal" value={bf} onChange={(e) => setBf(e.target.value.replace(/[^0-9.]/g, ''))} />
            </Field>
          </div>
        </div>
      )}
      {showMore && (
        <Field label="Note" htmlFor="b-notes">
          <input id="b-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>
      )}
      {err && <div className="field-error">{err}</div>}
      <FormFoot>
        {entry && (
          <button type="button" className="btn btn-ghost left" onClick={remove}>
            <Trash2 /> Delete
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {entry ? 'Save changes' : 'Save'}
        </button>
      </FormFoot>
    </form>
  );
}

// ── Notes & wins ────────────────────────────────────────────────────────────

export function NoteForm({ onDone, preset }: { onDone: () => void; preset?: { date?: ISODate } }) {
  const boot = useBoot();
  const ui = useUI();
  const [body, setBody] = useState('');
  const [date, setDate] = useState(preset?.date ?? boot.today);
  const [busy, setBusy] = useState(false);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.post('/notes', { date, body });
      await refreshAll();
      ui.toast('Note saved', { tone: 'success' });
      onDone();
    } catch (e) {
      ui.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="stack-16">
      <textarea
        className="textarea"
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Anything worth remembering…"
        data-autofocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
        }}
      />
      <div className="form-grid">
        <Field label="Date" htmlFor="n-date">
          <input id="n-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <FormFoot>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !body.trim()}>
          Save note
        </button>
      </FormFoot>
    </form>
  );
}

export function WinForm({ onDone, preset }: { onDone: () => void; preset?: { date?: ISODate } }) {
  const boot = useBoot();
  const ui = useUI();
  const [text, setText] = useState('');
  const [milestone, setMilestone] = useState(false);
  const [date, setDate] = useState(preset?.date ?? boot.today);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim()) return;
    try {
      await api.post('/accomplishments', { date, text, isMilestone: milestone });
      await refreshAll();
      ui.toast(milestone ? 'Milestone saved' : 'Win saved', { tone: 'success' });
      onDone();
    } catch (e) {
      ui.error(e);
    }
  };
  return (
    <form onSubmit={submit} className="stack-16">
      <input className="input input-lg" style={{ fontSize: 'var(--fs-17)' }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Launched the HVAC homepage" data-autofocus />
      <div className="form-grid">
        <Field label="Date" htmlFor="w-date">
          <input id="w-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <label className="check" style={{ height: 38 }}>
            <input type="checkbox" checked={milestone} onChange={(e) => setMilestone(e.target.checked)} />
            <Star size={14} /> Major milestone
          </label>
        </div>
      </div>
      <div className="field-hint">Milestones appear on your dashboard, in reviews, and in your Year in Review.</div>
      <FormFoot>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
          Save
        </button>
      </FormFoot>
    </form>
  );
}

// ── Day entry: rating + journal ─────────────────────────────────────────────

export function RatingPicker({ value, onChange, compact }: { value: Rating | null; onChange: (r: Rating) => void; compact?: boolean }) {
  const opts: [Rating, string, string][] = [
    [1, 'bad', 'Bad'],
    [2, 'okay', 'Okay'],
    [3, 'good', 'Good'],
  ];
  return (
    <div className={`rating-picker ${compact ? 'compact' : ''}`} role="radiogroup" aria-label="How was the day?">
      {opts.map(([r, cls, label]) => (
        <button key={r} type="button" role="radio" aria-checked={value === r} aria-pressed={value === r} className={`rating-btn ${cls}`} onClick={() => onChange(r)}>
          <span className="swatch" />
          {label}
        </button>
      ))}
    </div>
  );
}

/** One tap saves the rating; the note is optional and skippable. */
export function DayEntryForm({ date, initialRating, initialJournal, onDone }: { date: ISODate; initialRating: Rating | null; initialJournal: string | null; onDone: () => void }) {
  const ui = useUI();
  const [rating, setRating] = useState<Rating | null>(initialRating);
  const [journal, setJournal] = useState(initialJournal ?? '');
  const [busy, setBusy] = useState(false);
  const rate = async (r: Rating) => {
    setRating(r);
    try {
      await api.put(`/days/${date}`, { rating: r });
      refreshAll();
    } catch (e) {
      ui.error(e);
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/days/${date}`, { journal });
      await refreshAll();
      ui.toast('Saved', { tone: 'success' });
      onDone();
    } catch (e) {
      ui.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack-16">
      <RatingPicker value={rating} onChange={rate} />
      {rating && (
        <div className="stack-8" style={{ animation: 'rise-in 300ms var(--ease-out)' }}>
          <label className="field-label" htmlFor="day-journal">
            {rating ? `${RATING_LABEL[rating]} day saved.` : ''} Want to add anything about today?
          </label>
          <textarea id="day-journal" className="textarea" rows={4} value={journal} onChange={(e) => setJournal(e.target.value)} placeholder="Finished the homepage for the HVAC site, good workout, felt productive." />
        </div>
      )}
      <FormFoot>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {rating && !journal.trim() ? 'Skip' : 'Close'}
        </button>
        {rating && (
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || journal === (initialJournal ?? '')}>
            Save note
          </button>
        )}
      </FormFoot>
    </div>
  );
}

// ── Project ─────────────────────────────────────────────────────────────────

export function ProjectForm({ project, onDone }: { project?: Project; onDone: (p?: Project) => void }) {
  const ui = useUI();
  const [name, setName] = useState(project?.name ?? '');
  const [client, setClient] = useState(project?.client ?? '');
  const [status, setStatus] = useState<Project['status']>(project?.status ?? 'active');
  const [rate, setRate] = useState(centsStr(project?.hourlyRateCents));
  const [color, setColor] = useState(project?.color ?? '#2a78d6');
  const [notes, setNotes] = useState(project?.notes ?? '');
  const [err, setErr] = useState<string | null>(null);
  const COLORS = ['#2a78d6', '#1baf7a', '#eb6834', '#7f6fd8', '#e87ba4', '#c98500', '#4a9bb0', '#8a8f3c', '#52514e'];
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setErr(null);
    const body = { name, client: client || null, status, hourlyRateCents: rate.trim() ? toCents(rate) : null, color, notes: notes || null };
    try {
      const p = project ? await api.put<Project>(`/projects/${project.id}`, body) : await api.post<Project>('/projects', body);
      await refreshAll();
      ui.toast(project ? 'Project updated' : 'Project created', { tone: 'success' });
      onDone(p);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save');
    }
  };
  return (
    <form onSubmit={submit} className="stack-16">
      <div className="form-grid">
        <Field label="Name" htmlFor="p-name" className="span-2">
          <input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gulf Coast HVAC website" data-autofocus />
        </Field>
        <Field label="Client" htmlFor="p-client">
          <input id="p-client" className="input" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Hourly rate" htmlFor="p-rate" hint="Overrides your default for this project">
          <MoneyInput id="p-rate" value={rate} onChange={setRate} placeholder="Default" />
        </Field>
      </div>
      <div className="stack-8">
        <div className="field-label">Status</div>
        <Segmented
          block
          value={status}
          onChange={setStatus}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'paused', label: 'Paused' },
            { value: 'completed', label: 'Completed' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
      </div>
      <div className="stack-8">
        <div className="field-label">Color</div>
        <div className="row wrap">
          {COLORS.map((c) => (
            <button key={c} type="button" className={`color-swatch ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`} aria-pressed={color === c} />
          ))}
        </div>
      </div>
      <Field label="Notes" htmlFor="p-notes">
        <textarea id="p-notes" className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {err && <div className="field-error">{err}</div>}
      <FormFoot>
        <button type="button" className="btn btn-secondary" onClick={() => onDone()}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
          {project ? 'Save changes' : 'Create project'}
        </button>
      </FormFoot>
    </form>
  );
}

// ── Goals ───────────────────────────────────────────────────────────────────

interface Template {
  label: string;
  metric: GoalMetric;
  period: GoalPeriod;
  target: number;
  unit: 'money' | 'hours' | 'count' | 'weight' | 'length';
  title: (t: string, period: string) => string;
}

const PERIOD_WORD: Record<string, string> = { day: 'a day', week: 'a week', month: 'a month', year: 'a year' };

export const GOAL_TEMPLATES: Template[] = [
  { label: 'Earn', metric: 'earnings', period: 'month', target: 2000, unit: 'money', title: (t, p) => `Earn ${t} ${p}` },
  { label: 'Work hours', metric: 'hours', period: 'week', target: 20, unit: 'hours', title: (t, p) => `Work ${t} hours ${p}` },
  { label: 'Workouts', metric: 'workouts', period: 'week', target: 4, unit: 'count', title: (t, p) => `Work out ${t} times ${p}` },
  { label: 'Days worked', metric: 'work_days', period: 'month', target: 18, unit: 'count', title: (t, p) => `Work ${t} days ${p}` },
  { label: 'Good days', metric: 'good_days', period: 'month', target: 20, unit: 'count', title: (t, p) => `${t} good days ${p}` },
  { label: 'Gym hours', metric: 'gym_hours', period: 'month', target: 16, unit: 'hours', title: (t, p) => `${t} gym hours ${p}` },
  { label: 'Strength PRs', metric: 'prs', period: 'month', target: 1, unit: 'count', title: (t, p) => `Hit ${t} PR${t === '1' ? '' : 's'} ${p}` },
  { label: 'Finish projects', metric: 'projects_completed', period: 'year', target: 5, unit: 'count', title: (t, p) => `Complete ${t} projects ${p}` },
  { label: 'Progress photos', metric: 'photos', period: 'month', target: 1, unit: 'count', title: () => 'Monthly progress photos' },
  { label: 'Lift a weight', metric: 'exercise_weight', period: 'target', target: 225, unit: 'weight', title: (t) => `Lift ${t}` },
  { label: 'Estimated 1RM', metric: 'exercise_e1rm', period: 'target', target: 250, unit: 'weight', title: (t) => `${t} estimated max` },
  { label: 'Body weight', metric: 'weight', period: 'target', target: 170, unit: 'weight', title: (t) => `Reach ${t}` },
  { label: 'Waist', metric: 'waist', period: 'target', target: 32, unit: 'length', title: (t) => `Waist ${t}` },
  { label: 'Custom habit', metric: 'manual', period: 'day', target: 1, unit: 'count', title: () => '' },
];

export function GoalForm({ onDone }: { onDone: () => void }) {
  const boot = useBoot();
  const ui = useUI();
  const [tplIdx, setTplIdx] = useState(0);
  const tpl = GOAL_TEMPLATES[tplIdx];
  const [period, setPeriod] = useState<GoalPeriod>(tpl.period);
  const [recurring, setRecurring] = useState(true);
  const [target, setTarget] = useState(String(tpl.target));
  const [title, setTitle] = useState('');
  const [exercise, setExercise] = useState('');
  const [project, setProject] = useState('');
  const [start, setStart] = useState(boot.today);
  const [end, setEnd] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const projects = useProjectOptions();
  const exercises = useMemo(() => boot.exercises.map((e) => ({ id: e.id, label: e.name, hint: e.uses ? `${e.uses}×` : undefined })), [boot.exercises]);
  const isTarget = tpl.period === 'target';

  const pick = (i: number) => {
    const t = GOAL_TEMPLATES[i];
    setTplIdx(i);
    setPeriod(t.period);
    setTarget(String(t.metric === 'weight' || t.metric === 'exercise_weight' || t.metric === 'exercise_e1rm' ? (wUnit() === 'kg' ? Math.round(t.target / 2.2) : t.target) : t.metric === 'waist' && lUnit() === 'cm' ? Math.round(t.target * 2.54) : t.target));
    setTitle('');
  };

  const targetDisplay = tpl.unit === 'money' ? money((toCents(target) ?? 0)) : tpl.unit === 'weight' ? `${target} ${wUnit()}` : tpl.unit === 'length' ? `${target} ${lUnit()}` : target;
  const periodWord = period === 'custom' ? 'in this range' : recurring ? PERIOD_WORD[period] ?? '' : `this ${period}`;
  const suggested = tpl.metric === 'exercise_weight' || tpl.metric === 'exercise_e1rm' ? `${exercise || 'Bench Press'}: ${tpl.title(targetDisplay, periodWord)}` : tpl.title(targetDisplay, periodWord) + (project && (tpl.metric === 'earnings' || tpl.metric === 'hours') ? ` on ${project}` : '');

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setErr(null);
    const t = Number(target.replace(/,/g, ''));
    if (!(t > 0)) return setErr('Set a target');
    const base =
      tpl.unit === 'money' ? Math.round(t * 100)
      : tpl.unit === 'hours' ? t * 60
      : tpl.unit === 'weight' ? wFromDisplay(t)
      : tpl.unit === 'length' ? lFromDisplay(t)
      : t;
    const ex = boot.exercises.find((x) => x.name.toLowerCase() === exercise.trim().toLowerCase());
    if ((tpl.metric === 'exercise_weight' || tpl.metric === 'exercise_e1rm') && !ex) return setErr('Choose an exercise you’ve logged');
    const proj = boot.projects.find((p) => p.name.toLowerCase() === project.trim().toLowerCase());
    const body: GoalInput = {
      title: (title.trim() || suggested).trim(),
      metric: tpl.metric,
      period: isTarget ? 'target' : period,
      recurring: period === 'custom' ? false : recurring,
      target: base,
      startDate: period === 'custom' || isTarget ? start : null,
      endDate: period === 'custom' ? end : isTarget && end ? end : null,
      exerciseId: ex?.id ?? null,
      projectId: proj?.id ?? null,
    };
    if (tpl.metric === 'manual' && !title.trim()) return setErr('Name the habit');
    try {
      await api.post('/goals', body);
      await refreshAll();
      ui.toast('Goal created', { tone: 'success' });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save');
    }
  };

  return (
    <form onSubmit={submit} className="stack-16">
      <div className="stack-8">
        <div className="field-label">Type</div>
        <div className="row wrap" style={{ gap: 6 }}>
          {GOAL_TEMPLATES.map((t, i) => (
            <button key={t.label} type="button" className="chip" aria-pressed={i === tplIdx} onClick={() => pick(i)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {(tpl.metric === 'exercise_weight' || tpl.metric === 'exercise_e1rm') && (
        <Field label="Exercise" htmlFor="g-ex">
          <Combobox id="g-ex" value={exercise} onChange={(t) => setExercise(t)} options={exercises} allowCreate={false} placeholder="Bench Press" />
        </Field>
      )}
      <div className="form-grid">
        <Field label={tpl.metric === 'manual' ? 'Times' : 'Target'} htmlFor="g-target">
          {tpl.unit === 'money' ? (
            <MoneyInput id="g-target" value={target} onChange={setTarget} />
          ) : (
            <div className="input-affix has-right">
              <input id="g-target" className="input num" style={{ paddingLeft: 11 }} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ''))} />
              <span className="affix-r">{tpl.unit === 'hours' ? 'hours' : tpl.unit === 'weight' ? wUnit() : tpl.unit === 'length' ? lUnit() : ''}</span>
            </div>
          )}
        </Field>
        {!isTarget ? (
          <Field label="Period" htmlFor="g-period">
            <select id="g-period" className="select" value={period} onChange={(e) => setPeriod(e.target.value as GoalPeriod)}>
              <option value="day">Every day</option>
              <option value="week">Every week</option>
              <option value="month">Every month</option>
              <option value="year">Every year</option>
              <option value="custom">Custom dates</option>
            </select>
          </Field>
        ) : (
          <Field label="By (optional)" htmlFor="g-by">
            <input id="g-by" type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        )}
      </div>
      {period === 'custom' && !isTarget && (
        <div className="form-grid">
          <Field label="From" htmlFor="g-from">
            <input id="g-from" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="To" htmlFor="g-to">
            <input id="g-to" type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
      )}
      {!isTarget && period !== 'custom' && (
        <label className="check">
          <input type="checkbox" checked={!recurring} onChange={(e) => setRecurring(!e.target.checked)} />
          Only this {period} (don’t repeat)
        </label>
      )}
      {(tpl.metric === 'earnings' || tpl.metric === 'hours') && (
        <Field label="Only count one project (optional)" htmlFor="g-proj">
          <Combobox id="g-proj" value={project} onChange={(t) => setProject(t)} options={projects} allowCreate={false} placeholder="All work" />
        </Field>
      )}
      <Field label="Name" htmlFor="g-title" hint={tpl.metric !== 'manual' ? 'Progress updates automatically from your data.' : 'You’ll check this off yourself.'}>
        <input id="g-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tpl.metric === 'manual' ? 'Read 20 pages' : suggested} />
      </Field>
      {err && <div className="field-error">{err}</div>}
      <FormFoot>
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Create goal
        </button>
      </FormFoot>
    </form>
  );
}

