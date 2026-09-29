import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, Copy, History, Plus, Trash2, Trophy, X } from 'lucide-react';
import { api, refreshAll } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useUI } from '../lib/ui.tsx';
import { useDocumentTitle } from '../lib/hooks.ts';
import { clock, dayDate, shortDate, wFromDisplay, wUnit, wVal } from '../lib/format.ts';
import { Combobox } from '../components/ui/Combobox.tsx';
import { ErrorBox, PageSkeleton } from '../components/ui/primitives.tsx';
import { groupPRs, prText } from '../features/shared.tsx';
import { estimate1RM } from '../../shared/fitness.ts';
import { clockToMinutes, localTime, type ISODate } from '../../shared/dates.ts';
import type { PR, Workout, WorkoutInput } from '../../shared/types.ts';

interface DraftSet {
  w: string; // display units
  r: string;
  rpe: string;
  warm: boolean;
}
interface DraftExercise {
  key: string;
  exerciseId: number | null;
  name: string;
  notes: string;
  sets: DraftSet[];
}
interface Draft {
  name: string;
  date: ISODate;
  startTime: string;
  duration: string;
  notes: string;
  exercises: DraftExercise[];
}

interface LastPerf {
  workoutId: number;
  workoutName: string;
  date: ISODate;
  sets: { weightKg: number | null; reps: number | null; rpe: number | null; isWarmup: boolean }[];
}

let keySeq = 1;
const newKey = () => `ex${keySeq++}`;
const blankSet = (): DraftSet => ({ w: '', r: '', rpe: '', warm: false });

function fromWorkout(w: Workout): Draft {
  return {
    name: w.name,
    date: w.date,
    startTime: w.startTime ?? '',
    duration: w.durationMinutes != null ? String(w.durationMinutes) : '',
    notes: w.notes ?? '',
    exercises: w.exercises.map((e) => ({
      key: newKey(),
      exerciseId: e.exerciseId,
      name: e.exerciseName,
      notes: e.notes ?? '',
      sets: e.sets.map((s) => ({ w: s.weightKg != null ? String(wVal(s.weightKg)) : '', r: s.reps != null ? String(s.reps) : '', rpe: s.rpe != null ? String(s.rpe) : '', warm: s.isWarmup })),
    })),
  };
}

function toInput(d: Draft): WorkoutInput {
  const n = (s: string) => (s.trim() === '' ? null : Number(s));
  return {
    name: d.name.trim() || 'Workout',
    date: d.date,
    startTime: d.startTime || null,
    durationMinutes: n(d.duration),
    notes: d.notes.trim() || null,
    exercises: d.exercises
      .filter((e) => e.name.trim())
      .map((e) => ({
        exerciseId: e.exerciseId,
        exerciseName: e.name.trim(),
        notes: e.notes.trim() || null,
        sets: e.sets.map((s) => ({
          weightKg: n(s.w) != null ? wFromDisplay(n(s.w)!) : null,
          reps: n(s.r) != null ? Math.round(n(s.r)!) : null,
          rpe: n(s.rpe),
          isWarmup: s.warm,
        })),
      })),
  };
}

export default function WorkoutEditor() {
  const { id } = useParams();
  return id ? <Editor id={Number(id)} /> : <NewWorkout />;
}

// ── Start a workout ──────────────────────────────────────────────────────────

function NewWorkout() {
  const boot = useBoot();
  const ui = useUI();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const date = params.get('date') ?? boot.today;
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useDocumentTitle('New workout');
  const auto = useRef(false);
  useEffect(() => {
    const t = params.get('template');
    if (t && !auto.current) {
      auto.current = true;
      start(Number(t), params.get('name') ?? undefined);
    }
  }, []);
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => api.get<{ name: string; lastDate: string; times: number; workoutId: number }[]>('/workouts/templates') });

  const start = async (templateId?: number, templateName?: string) => {
    setBusy(true);
    try {
      let exercises: WorkoutInput['exercises'] = [];
      if (templateId) {
        const t = await api.get<Workout>(`/workouts/${templateId}`);
        // Same exercises and set count as last time; the numbers stay blank, with last time shown as a guide.
        exercises = t.exercises.map((e) => ({
          exerciseId: e.exerciseId,
          exerciseName: e.exerciseName,
          sets: [],
        }));
      }
      const w = await api.post<Workout>('/workouts', {
        name: (templateName ?? name).trim() || 'Workout',
        date,
        startTime: date === boot.today ? localTime() : null,
        exercises,
      });
      await refreshAll();
      navigate(`/gym/workouts/${w.id}?new=1${templateId ? `&from=${templateId}` : ''}`, { replace: true });
    } catch (e) {
      ui.error(e);
      setBusy(false);
    }
  };

  return (
    <div className="page workout-page">
      <Link to="/gym" className="back-link">
        <ChevronLeft /> Gym
      </Link>
      <h1 className="serif wo-title">Start a workout</h1>
      <div className="faint" style={{ marginTop: 6 }}>{dayDate(date)}</div>

      {templates.data && templates.data.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Repeat a workout</h2>
            <span className="sub">Same exercises, with last time’s numbers as your guide</span>
          </div>
          <div className="template-grid">
            {templates.data.map((t) => (
              <button key={t.name} className="template-card" onClick={() => start(t.workoutId, t.name)} disabled={busy}>
                <div className="tc-name">{t.name}</div>
                <div className="tc-meta">
                  Last {shortDate(t.lastDate)} · {t.times}×
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Or start fresh</h2>
        </div>
        <form
          className="row"
          style={{ gap: 8, maxWidth: 520 }}
          onSubmit={(e) => {
            e.preventDefault();
            start();
          }}
        >
          <input className="input" style={{ height: 44 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Workout name — e.g. Push Day" autoFocus />
          <button className="btn btn-primary btn-lg" disabled={busy}>
            Start
          </button>
        </form>
      </section>
    </div>
  );
}

// ── Editing / logging ────────────────────────────────────────────────────────

function Editor({ id }: { id: number }) {
  const boot = useBoot();
  const ui = useUI();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = useQuery({ queryKey: ['workout', id], queryFn: () => api.get<Workout>(`/workouts/${id}`), staleTime: Infinity, refetchOnWindowFocus: false });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [prs, setPrs] = useState<PR[]>([]);
  const [status, setStatus] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<Draft | null>(null);
  const seenPRs = useRef<Set<string>>(new Set());
  const isNew = params.get('new') === '1';
  useDocumentTitle(draft?.name ?? 'Workout');

  useEffect(() => {
    if (q.data && !draft) {
      const d = fromWorkout(q.data);
      // Freshly started from a template: give each exercise empty set rows to fill.
      if (isNew) d.exercises.forEach((e) => e.sets.length === 0 && e.sets.push(blankSet(), blankSet(), blankSet()));
      setDraft(d);
      setPrs(q.data.prs);
      q.data.prs.forEach((p) => seenPRs.current.add(`${p.exerciseId}-${p.type}`));
    }
  }, [q.data]);

  const save = useCallback(async () => {
    const d = latest.current;
    if (!d) return;
    setStatus('saving');
    try {
      const w = await api.put<Workout>(`/workouts/${id}`, toInput(d));
      // Adopt server-resolved exercise ids (for new exercise names) without disturbing typing.
      setDraft((cur) => {
        if (!cur) return cur;
        const named = cur.exercises.filter((e) => e.name.trim());
        let changed = false;
        const ids = new Map(w.exercises.map((e, i) => [named[i]?.key, e.exerciseId]));
        const exercises = cur.exercises.map((e) => {
          const nid = ids.get(e.key);
          if (nid && nid !== e.exerciseId) {
            changed = true;
            return { ...e, exerciseId: nid };
          }
          return e;
        });
        return changed ? { ...cur, exercises } : cur;
      });
      setPrs(w.prs);
      const fresh = w.prs.filter((p) => !seenPRs.current.has(`${p.exerciseId}-${p.type}`));
      w.prs.forEach((p) => seenPRs.current.add(`${p.exerciseId}-${p.type}`));
      if (fresh.length) {
        const lead = groupPRs(fresh)[0].lead;
        ui.toast(
          <span className="row" style={{ gap: 8 }}>
            <Trophy size={16} /> {prText(lead).kind} · {lead.exerciseName} {prText(lead).value}
          </span>,
          { ms: 4500 },
        );
      }
      setStatus(latest.current === d ? 'saved' : 'dirty');
      refreshAll();
    } catch (e) {
      setStatus('error');
      ui.error(e);
    }
  }, [id, ui]);

  const update = (fn: (d: Draft) => Draft) => {
    setDraft((cur) => {
      if (!cur) return cur;
      const next = fn(cur);
      latest.current = next;
      return next;
    });
    setStatus('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, 700);
  };

  // Flush on leave.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (latest.current) api.put(`/workouts/${id}`, toInput(latest.current)).then(() => refreshAll()).catch(() => {});
    },
    [id],
  );

  const exOptions = useMemo(() => boot.exercises.map((e) => ({ id: e.id, label: e.name, hint: e.uses ? `${e.uses}×` : undefined })), [boot.exercises]);

  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!draft) return <PageSkeleton />;

  const finish = async () => {
    window.clearTimeout(timer.current);
    let d = draft;
    if (!d.duration && d.startTime && d.date === boot.today) {
      const mins = clockToMinutes(localTime()) - clockToMinutes(d.startTime);
      if (mins > 0 && mins < 300) d = { ...d, duration: String(mins) };
    }
    latest.current = null;
    try {
      const w = await api.put<Workout>(`/workouts/${id}`, toInput(d));
      await refreshAll();
      const n = groupPRs(w.prs).length;
      ui.toast(n ? `Workout saved · ${n} PR${n > 1 ? 's' : ''} 🏆` : 'Workout saved', { tone: 'success' });
      setParams({});
      navigate('/gym');
    } catch (e) {
      ui.error(e);
    }
  };

  const remove = async () => {
    const ok = await ui.confirm({ title: 'Delete this workout?', body: 'You can undo this right after, or restore it later from Settings → Recently deleted.', confirm: 'Delete', danger: true });
    if (!ok) return;
    window.clearTimeout(timer.current);
    latest.current = null;
    await api.del(`/workouts/${id}`);
    ui.deleted('Workout', 'workouts', id);
    navigate('/gym');
  };

  const addExercise = () => update((d) => ({ ...d, exercises: [...d.exercises, { key: newKey(), exerciseId: null, name: '', notes: '', sets: [blankSet()] }] }));
  const totalSets = draft.exercises.reduce((a, e) => a + e.sets.filter((s) => !s.warm && s.r).length, 0);
  const volume = draft.exercises.reduce((a, e) => a + e.sets.reduce((b, s) => b + (s.warm ? 0 : (Number(s.w) || 0) * (Number(s.r) || 0)), 0), 0);
  const prByEx = new Map<number, PR[]>();
  for (const p of prs) prByEx.set(p.exerciseId, [...(prByEx.get(p.exerciseId) ?? []), p]);

  return (
    <div className="page workout-page">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Link to="/gym" className="back-link">
          <ChevronLeft /> Gym
        </Link>
        <span className={`save-status ${status}`} aria-live="polite">
          {status === 'saving' ? 'Saving…' : status === 'dirty' ? 'Editing' : status === 'error' ? 'Not saved' : 'Saved'}
        </span>
      </div>
      <input className="wo-name serif" value={draft.name} onChange={(e) => update((d) => ({ ...d, name: e.target.value }))} aria-label="Workout name" />
      <div className="wo-meta">
        <label>
          <span>Date</span>
          <input type="date" className="input input-sm" value={draft.date} onChange={(e) => update((d) => ({ ...d, date: e.target.value }))} />
        </label>
        <label>
          <span>Started</span>
          <input type="time" className="input input-sm" value={draft.startTime} onChange={(e) => update((d) => ({ ...d, startTime: e.target.value }))} />
        </label>
        <label>
          <span>Minutes</span>
          <input className="input input-sm num" style={{ width: 80 }} inputMode="numeric" value={draft.duration} placeholder={draft.startTime && draft.date === boot.today ? 'auto' : '—'} onChange={(e) => update((d) => ({ ...d, duration: e.target.value.replace(/\D/g, '') }))} />
        </label>
        <span className="wo-totals faint num">
          {totalSets} sets · {Math.round(volume).toLocaleString()} {wUnit()} volume
          {draft.startTime && draft.date === boot.today && !draft.duration ? ` · since ${clock(draft.startTime)}` : ''}
        </span>
      </div>

      <div className="stack-16" style={{ marginTop: 24 }}>
        {draft.exercises.map((ex, i) => (
          <ExerciseBlock
            key={ex.key}
            ex={ex}
            workoutId={id}
            prs={ex.exerciseId ? prByEx.get(ex.exerciseId) ?? [] : []}
            options={exOptions}
            autoFocus={!ex.name}
            onChange={(next) => update((d) => ({ ...d, exercises: d.exercises.map((e, j) => (j === i ? next : e)) }))}
            onRemove={() => update((d) => ({ ...d, exercises: d.exercises.filter((_, j) => j !== i) }))}
          />
        ))}
        <button className="add-exercise" onClick={addExercise}>
          <Plus /> Add exercise
        </button>
      </div>

      <div className="field" style={{ marginTop: 24 }}>
        <label htmlFor="wo-notes">Notes</label>
        <textarea id="wo-notes" className="textarea" rows={2} value={draft.notes} onChange={(e) => update((d) => ({ ...d, notes: e.target.value }))} placeholder="How did it feel?" />
      </div>

      <div className="wo-foot">
        <button className="btn btn-ghost" onClick={remove}>
          <Trash2 /> Delete
        </button>
        <button className="btn btn-primary btn-lg" onClick={finish}>
          <Check /> Finish workout
        </button>
      </div>
    </div>
  );
}

function ExerciseBlock({ ex, workoutId, prs, options, autoFocus, onChange, onRemove }: {
  ex: DraftExercise;
  workoutId: number;
  prs: PR[];
  options: { id: number; label: string; hint?: string }[];
  autoFocus: boolean;
  onChange: (e: DraftExercise) => void;
  onRemove: () => void;
}) {
  const last = useQuery({
    queryKey: ['last', ex.exerciseId, workoutId],
    queryFn: () => api.get<LastPerf | null>(`/exercises/${ex.exerciseId}/last?exclude=${workoutId}`),
    enabled: !!ex.exerciseId,
    staleTime: 60_000,
  }).data;
  const lastWorking = last?.sets.filter((s) => !s.isWarmup) ?? [];
  // A freshly repeated workout gets as many rows as last time.
  const allBlank = ex.sets.every((s) => !s.w && !s.r);
  useEffect(() => {
    if (last && allBlank && ex.sets.length < lastWorking.length) {
      onChange({ ...ex, sets: [...ex.sets, ...Array.from({ length: lastWorking.length - ex.sets.length }, blankSet)] });
    }
  }, [last?.workoutId]);
  const setSet = (i: number, patch: Partial<DraftSet>) => onChange({ ...ex, sets: ex.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const guide = (i: number) => {
    // Working set i lines up with last time's working set i.
    const workingIdx = ex.sets.slice(0, i).filter((s) => !s.warm).length;
    return ex.sets[i].warm ? null : lastWorking[workingIdx] ?? lastWorking[lastWorking.length - 1] ?? null;
  };
  const addSet = () => {
    const prev = ex.sets[ex.sets.length - 1];
    onChange({ ...ex, sets: [...ex.sets, prev && (prev.w || prev.r) ? { ...prev, rpe: '', warm: false } : blankSet()] });
  };
  const bestE1 = Math.max(0, ...ex.sets.filter((s) => !s.warm).map((s) => estimate1RM(Number(s.w), Number(s.r)) ?? 0));

  return (
    <section className="ex-block">
      <div className="ex-head">
        <div className="grow" style={{ minWidth: 0 }}>
          {ex.exerciseId && ex.name ? (
            <div className="row" style={{ gap: 8 }}>
              <Link to={`/gym/exercises/${ex.exerciseId}`} className="ex-name">
                {ex.name}
              </Link>
              {groupPRs(prs).map((g) => (
                <span key={g.key} className="badge badge-pr pr-pop">
                  <Trophy /> {prText(g.lead).kind}
                </span>
              ))}
            </div>
          ) : (
            <Combobox value={ex.name} onChange={(t, o) => onChange({ ...ex, name: t, exerciseId: o ? Number(o.id) : null })} options={options} placeholder="Exercise — e.g. Bench Press" autoFocus={autoFocus} createLabel="New exercise" />
          )}
          {last && (
            <div className="last-time">
              <History size={13} /> Last time · {shortDate(last.date)}:{' '}
              <span className="num">
                {lastWorking
                  .slice(0, 5)
                  .map((s) => `${s.weightKg != null ? wVal(s.weightKg) : 'BW'} × ${s.reps ?? '–'}`)
                  .join(', ')}
              </span>
            </div>
          )}
          {ex.exerciseId && !last && <div className="last-time">First time logging this exercise</div>}
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onRemove} aria-label={`Remove ${ex.name || 'exercise'}`}>
          <X />
        </button>
      </div>

      <div className="set-table" role="table" aria-label={`${ex.name} sets`}>
        <div className="set-row set-header" role="row">
          <span>Set</span>
          <span className="hide-mobile">Last time</span>
          <span>{wUnit()}</span>
          <span>Reps</span>
          <span className="hide-mobile">RPE</span>
          <span />
        </div>
        {ex.sets.map((s, i) => {
          const g = guide(i);
          const done = !!(s.w || s.r);
          const workingNo = ex.sets.slice(0, i + 1).filter((x) => !x.warm).length;
          const beat = g && !s.warm && s.w && s.r && (Number(s.w) > (wVal(g.weightKg) ?? 0) || (Number(s.w) === (wVal(g.weightKg) ?? 0) && Number(s.r) > (g.reps ?? 0)));
          return (
            <div key={i} className={`set-row ${s.warm ? 'warm' : ''} ${done ? 'done' : ''}`} role="row">
              <button className="set-no" onClick={() => setSet(i, { warm: !s.warm })} title="Tap to toggle warm-up" aria-label={s.warm ? 'Warm-up set; mark as working set' : `Set ${workingNo}; mark as warm-up`}>
                {s.warm ? 'W' : workingNo}
              </button>
              <span className="set-prev hide-mobile num">{g ? `${g.weightKg != null ? wVal(g.weightKg) : 'BW'} × ${g.reps}` : '—'}</span>
              <input
                className="input set-input num"
                inputMode="decimal"
                value={s.w}
                placeholder={g?.weightKg != null ? String(wVal(g.weightKg)) : ''}
                onChange={(e) => setSet(i, { w: e.target.value.replace(/[^0-9.]/g, '') })}
                aria-label={`Set ${i + 1} weight`}
              />
              <input
                className="input set-input num"
                inputMode="numeric"
                value={s.r}
                placeholder={g?.reps != null ? String(g.reps) : ''}
                onChange={(e) => setSet(i, { r: e.target.value.replace(/\D/g, '') })}
                aria-label={`Set ${i + 1} reps`}
              />
              <input className="input set-input num hide-mobile" inputMode="decimal" value={s.rpe} placeholder="" onChange={(e) => setSet(i, { rpe: e.target.value.replace(/[^0-9.]/g, '') })} aria-label={`Set ${i + 1} RPE`} />
              <span className="set-actions">
                {!done && g ? (
                  <button className="btn btn-ghost btn-icon btn-sm" title="Same as last time" aria-label="Same as last time" onClick={() => setSet(i, { w: g.weightKg != null ? String(wVal(g.weightKg)) : '', r: g.reps != null ? String(g.reps) : '' })}>
                    <Copy />
                  </button>
                ) : beat ? (
                  <span className="beat" title="More than last time">
                    ↑
                  </span>
                ) : null}
                <button className="btn btn-ghost btn-icon btn-sm" aria-label={`Delete set ${i + 1}`} onClick={() => onChange({ ...ex, sets: ex.sets.filter((_, j) => j !== i) })}>
                  <X />
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={addSet}>
          <Plus /> Add set
        </button>
        {bestE1 > 0 && <span className="faint num" style={{ fontSize: 12 }}>Best est. 1RM today: {Math.round(bestE1 * 10) / 10} {wUnit()}</span>}
      </div>
    </section>
  );
}

