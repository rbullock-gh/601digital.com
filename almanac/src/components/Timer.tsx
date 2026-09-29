import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pause, Play, Square } from 'lucide-react';
import { api, refreshAll } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useUI } from '../lib/ui.tsx';
import { useTick } from '../lib/hooks.ts';
import { clock, currencySymbol, duration, money } from '../lib/format.ts';
import { Dialog } from './ui/Dialog.tsx';
import { Combobox } from './ui/Combobox.tsx';
import { Segmented } from './ui/Segmented.tsx';
import { Field, toCents } from '../features/forms.tsx';
import type { Timer, WorkSession } from '../../shared/types.ts';

export function elapsedMs(t: Timer, now = Date.now()) {
  const end = t.pausedAt ? Date.parse(t.pausedAt) : now;
  return Math.max(0, end - Date.parse(t.startedAt) - t.breakMs);
}

export function fmtElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function useTimerActions() {
  const ui = useUI();
  const run = async (path: string, msg?: string) => {
    try {
      await api.post(`/timer/${path}`);
      await refreshAll();
      if (msg) ui.toast(msg);
    } catch (e) {
      ui.error(e);
    }
  };
  return {
    start: () => run('start', 'Timer started'),
    pause: () => run('pause'),
    resume: () => run('resume'),
    stop: () => ui.setStopOpen(true),
  };
}

function useProjectName(id: number | null) {
  const boot = useBoot();
  return id ? boot.projects.find((p) => p.id === id)?.name ?? null : null;
}

/** Sidebar widget: start work, or the live timer with pause and stop. */
export function TimerCard() {
  const { timer } = useBoot();
  const a = useTimerActions();
  useTick(1000, !!timer && !timer.pausedAt);
  const project = useProjectName(timer?.projectId ?? null);
  if (!timer)
    return (
      <button className="start-work" onClick={a.start}>
        <Play /> Start work
      </button>
    );
  return (
    <div className="timer-card" aria-live="off">
      <div className="t-top">
        <span className={`timer-live ${timer.pausedAt ? 'paused' : ''}`} />
        <span className="timer-time">{fmtElapsed(elapsedMs(timer))}</span>
      </div>
      <div className="timer-sub truncate">
        {timer.pausedAt ? 'Paused' : `Since ${clock(timer.startClock)}`}
        {project ? ` · ${project}` : ''}
      </div>
      <div className="timer-actions">
        {timer.pausedAt ? (
          <button className="btn btn-secondary btn-sm" onClick={a.resume}>
            <Play /> Resume
          </button>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={a.pause}>
            <Pause /> Pause
          </button>
        )}
        <button className="btn btn-primary btn-sm" onClick={a.stop}>
          <Square /> Stop
        </button>
      </div>
    </div>
  );
}

/** Mobile: a floating pill above the tab bar while the timer runs. */
export function TimerPill() {
  const { timer } = useBoot();
  const a = useTimerActions();
  useTick(1000, !!timer && !timer.pausedAt);
  const project = useProjectName(timer?.projectId ?? null);
  if (!timer) return null;
  return (
    <div className="timer-pill" role="status">
      <span className={`timer-live ${timer.pausedAt ? 'paused' : ''}`} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="timer-time">{fmtElapsed(elapsedMs(timer))}</div>
        <div className="label truncate">{timer.pausedAt ? 'Paused' : project ?? `Working since ${clock(timer.startClock)}`}</div>
      </div>
      <button className="btn btn-ghost btn-icon" onClick={timer.pausedAt ? a.resume : a.pause} aria-label={timer.pausedAt ? 'Resume' : 'Pause'}>
        {timer.pausedAt ? <Play /> : <Pause />}
      </button>
      <button className="btn btn-primary" onClick={a.stop}>
        <Square /> Stop
      </button>
    </div>
  );
}

/** Stopping the timer asks what you worked on, then logs the session. */
export function StopTimerDialog() {
  const ui = useUI();
  const boot = useBoot();
  const timer = boot.timer;
  const open = ui.stopOpen && !!timer;
  const last = useQuery({
    queryKey: ['work', 'last'],
    queryFn: () => api.get<{ sessions: WorkSession[] }>('/work/sessions?limit=1'),
    enabled: open,
  }).data?.sessions[0];
  const [description, setDescription] = useState('');
  const [project, setProject] = useState('');
  const [category, setCategory] = useState('');
  const [payType, setPayType] = useState<WorkSession['payType']>('hourly');
  const [rate, setRate] = useState('');
  const [flat, setFlat] = useState('');
  const [busy, setBusy] = useState(false);
  const now = useTick(1000, open);

  useEffect(() => {
    if (!open || !timer) return;
    setDescription(timer.description ?? '');
    const p = timer.projectId ? boot.projects.find((x) => x.id === timer.projectId)?.name : last?.projectName;
    setProject(p ?? '');
    setCategory(timer.categoryId ? boot.categories.find((c) => c.id === timer.categoryId)?.name ?? '' : last?.categoryName ?? '');
    setPayType('hourly');
    setRate('');
    setFlat('');
  }, [open, last?.id]);

  const projects = useMemo(() => boot.projects.filter((p) => p.status !== 'archived').map((p) => ({ id: p.id, label: p.name, color: p.color })), [boot.projects]);
  const categories = useMemo(() => boot.categories.map((c) => ({ id: c.id, label: c.name })), [boot.categories]);
  if (!timer) return null;
  const minutes = Math.max(1, Math.round(elapsedMs(timer, now) / 60000));
  const proj = boot.projects.find((p) => p.name.toLowerCase() === project.trim().toLowerCase());
  const impliedRate = proj?.hourlyRateCents ?? boot.settings.defaultRateCents;
  const rateC = toCents(rate) ?? impliedRate;
  const earned = payType === 'hourly' ? Math.round((minutes * rateC) / 60) : payType === 'flat' ? toCents(flat) ?? 0 : 0;

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const s = await api.post<WorkSession>('/timer/stop', {
        description: description.trim() || null,
        projectName: project.trim() || null,
        categoryName: category.trim() || null,
        payType,
        hourlyRateCents: payType === 'hourly' && rate.trim() ? toCents(rate) : null,
        flatAmountCents: payType === 'flat' ? toCents(flat) : null,
      });
      await refreshAll();
      ui.setStopOpen(false);
      ui.toast(`Logged ${duration(s.minutes)}${s.earnedCents ? ` · ${money(s.earnedCents)}` : ''}${s.projectName ? ` · ${s.projectName}` : ''}`, { tone: 'success' });
    } catch (err) {
      ui.error(err);
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    const ok = await ui.confirm({ title: 'Discard this timer?', body: `${duration(minutes)} of tracked time will not be logged.`, confirm: 'Discard', danger: true });
    if (!ok) return;
    await api.post('/timer/discard');
    await refreshAll();
    ui.setStopOpen(false);
    ui.toast('Timer discarded');
  };

  return (
    <Dialog
      open={open}
      onClose={() => ui.setStopOpen(false)}
      title="What did you work on?"
      subtitle={`${duration(minutes)} since ${clock(timer.startClock)}`}
      footer={
        <>
          <button className="btn btn-ghost left" onClick={discard}>
            Discard
          </button>
          <button className="btn btn-secondary" onClick={() => ui.setStopOpen(false)}>
            Keep running
          </button>
          <button className="btn btn-primary" onClick={() => save()} disabled={busy}>
            Log {duration(minutes)}
          </button>
        </>
      }
    >
      <form onSubmit={save} className="stack-16">
        <input className="input input-lg" style={{ fontSize: 'var(--fs-17)' }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Finished the homepage hero" data-autofocus aria-label="What did you work on?" />
        <div className="form-grid">
          <Field label="Project" htmlFor="st-proj">
            <Combobox id="st-proj" value={project} onChange={(t) => setProject(t)} options={projects} placeholder="Optional" />
          </Field>
          <Field label="Category" htmlFor="st-cat">
            <Combobox id="st-cat" value={category} onChange={(t) => setCategory(t)} options={categories} placeholder="Optional" />
          </Field>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
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
          {payType === 'hourly' && (
            <div className="input-affix has-right" style={{ width: 150 }}>
              <span className="affix">{currencySymbol()}</span>
              <input className="input num" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={(impliedRate / 100).toString()} aria-label="Hourly rate" />
              <span className="affix-r">/h</span>
            </div>
          )}
          {payType === 'flat' && (
            <div className="input-affix" style={{ width: 150 }}>
              <span className="affix">{currencySymbol()}</span>
              <input className="input num" inputMode="decimal" value={flat} onChange={(e) => setFlat(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" aria-label="Flat amount" />
            </div>
          )}
        </div>
        <div className="summary-strip">
          <div>
            <div className="eyebrow">Time</div>
            <div className="v num">{duration(minutes)}</div>
          </div>
          <div>
            <div className="eyebrow">Earned</div>
            <div className="v num">{money(earned)}</div>
          </div>
          <div>
            <div className="eyebrow">Break</div>
            <div className="v num">{duration(Math.round((timer.breakMs + (timer.pausedAt ? now - Date.parse(timer.pausedAt) : 0)) / 60000))}</div>
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
