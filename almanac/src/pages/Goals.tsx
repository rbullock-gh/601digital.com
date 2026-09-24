import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, Check, Flame, MoreHorizontal, Pencil, Plus, RotateCcw, Target, Trash2 } from 'lucide-react';
import { api, refreshAll } from '../lib/api.ts';
import { useUI } from '../lib/ui.tsx';
import { useBoot } from '../lib/boot.ts';
import { useClickOutside, useDocumentTitle } from '../lib/hooks.ts';
import { lFromDisplay, lVal, shortDate, wFromDisplay, wVal } from '../lib/format.ts';
import { Card, Empty, ErrorBox, Meter, PageHead, PageSkeleton } from '../components/ui/primitives.tsx';
import { Dialog } from '../components/ui/Dialog.tsx';
import { Field, toCents } from '../features/forms.tsx';
import { goalNumbers, goalPeriodLabel } from '../features/shared.tsx';
import type { GoalProgress } from '../../shared/types.ts';

const GROUPS: { key: string; label: string; match: (g: GoalProgress) => boolean }[] = [
  { key: 'day', label: 'Daily', match: (g) => g.period === 'day' },
  { key: 'week', label: 'Weekly', match: (g) => g.period === 'week' },
  { key: 'month', label: 'Monthly', match: (g) => g.period === 'month' },
  { key: 'year', label: 'Yearly', match: (g) => g.period === 'year' },
  { key: 'target', label: 'Targets & ranges', match: (g) => g.period === 'target' || g.period === 'custom' },
];
const PERIOD_UNIT: Record<string, string> = { day: 'day', week: 'week', month: 'month', year: 'year' };

export default function Goals() {
  const ui = useUI();
  useDocumentTitle('Goals');
  const [archived, setArchived] = useState(false);
  const q = useQuery({ queryKey: ['goals', archived], queryFn: () => api.get<GoalProgress[]>(`/goals${archived ? '?archived=1' : ''}`) });
  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const goals = q.data.filter((g) => (archived ? g.status === 'archived' : g.status === 'active'));

  return (
    <div className="page">
      <PageHead
        title="Goals"
        sub="Progress updates itself from what you log. No manual bookkeeping."
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setArchived(!archived)}>
              {archived ? 'Active goals' : 'Archived'}
            </button>
            <button className="btn btn-primary" onClick={() => ui.openAdd('goal', { direct: true })}>
              <Plus /> New goal
            </button>
          </>
        }
      />
      {!goals.length ? (
        <Card>
          <Empty icon={<Target />} title={archived ? 'No archived goals' : 'No goals yet'} action={!archived && <button className="btn btn-primary btn-sm" onClick={() => ui.openAdd('goal', { direct: true })}>Create a goal</button>}>
            Try “Earn $2,000 this month”, “Work out 4 times a week”, or “Bench 225 lb”.
          </Empty>
        </Card>
      ) : (
        GROUPS.map((grp) => {
          const list = goals.filter(grp.match);
          if (!list.length) return null;
          return (
            <section key={grp.key} className="goal-section">
              <div className="section-head">
                <h2>{grp.label}</h2>
                <span className="sub">
                  {list.filter((g) => g.done).length}/{list.length} {grp.key === 'target' ? 'reached' : 'done'}
                </span>
              </div>
              <div className="goal-grid">
                {list.map((g) => (
                  <GoalCard key={g.id} g={g} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function GoalCard({ g }: { g: GoalProgress }) {
  const ui = useUI();
  const boot = useBoot();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setMenu(false), menu);
  const manualDaily = g.metric === 'manual' && g.period === 'day';

  const act = async (fn: () => Promise<unknown>, msg?: string) => {
    setMenu(false);
    try {
      await fn();
      await refreshAll();
      if (msg) ui.toast(msg);
    } catch (e) {
      ui.error(e);
    }
  };
  const toggle = () => act(() => api.post(`/goals/${g.id}/checkin`, { date: boot.today, value: null }));
  const plusOne = () => act(() => api.post(`/goals/${g.id}/checkin`, { date: boot.today, value: 1 }), '+1');
  const remove = async () => {
    setMenu(false);
    await api.del(`/goals/${g.id}`);
    ui.deleted('Goal', 'goals', g.id);
  };

  return (
    <div className={`goal-card ${g.done ? 'done' : ''}`} id={`goal-${g.id}`}>
      <div className="gc-top">
        {manualDaily && (
          <button className={`goal-check ${g.done ? 'on' : ''}`} onClick={toggle} aria-pressed={g.done} aria-label={g.done ? 'Mark not done' : 'Mark done today'}>
            {g.done && <Check />}
          </button>
        )}
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="gc-title">{g.title}</div>
          <div className="gc-sub">
            {goalPeriodLabel(g)}
            {g.projectName ? ` · ${g.projectName}` : ''}
            {g.exerciseName ? ` · ${g.exerciseName}` : ''}
          </div>
        </div>
        <div className="menu-wrap" ref={ref}>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setMenu(!menu)} aria-label="Goal options" aria-expanded={menu}>
            <MoreHorizontal />
          </button>
          {menu && (
            <div className="popover menu-pop" role="menu">
              <button className="menu-item" role="menuitem" onClick={() => (setMenu(false), setEditing(true))}>
                <Pencil /> Edit
              </button>
              {g.status === 'active' ? (
                <button className="menu-item" role="menuitem" onClick={() => act(() => api.put(`/goals/${g.id}`, { status: 'archived' }), 'Goal archived — its history is kept')}>
                  <Archive /> Archive
                </button>
              ) : (
                <button className="menu-item" role="menuitem" onClick={() => act(() => api.put(`/goals/${g.id}`, { status: 'active' }), 'Goal restored')}>
                  <RotateCcw /> Restore
                </button>
              )}
              <div className="menu-sep" />
              <button className="menu-item danger" role="menuitem" onClick={remove}>
                <Trash2 /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {!manualDaily && (
        <>
          <div className="gc-value">
            <span className="num">{goalNumbers(g)[0]}</span>
            <span className="faint num">{goalNumbers(g)[1]}</span>
            {g.done ? (
              <span className="badge badge-good" style={{ marginLeft: 'auto' }}>
                <Check /> {g.completedOn ? `Reached ${shortDate(g.completedOn)}` : 'Done'}
              </span>
            ) : (
              <span className="faint num" style={{ marginLeft: 'auto', fontSize: 12 }}>
                {Math.round(g.pct * 100)}%
              </span>
            )}
          </div>
          <Meter value={g.pct} done={g.done} label={g.title} />
        </>
      )}

      {g.history && g.history.length > 1 && (
        <div className="gc-history">
          <div className="gc-dots" aria-label="Recent periods">
            {g.history.map((h, i) => (
              <span key={h.start} className={`gc-dot ${h.done ? 'on' : ''} ${i === g.history!.length - 1 ? 'current' : ''}`} title={`${shortDate(h.start)}: ${h.done ? 'done' : 'not done'}`} />
            ))}
          </div>
          {g.streak ? (
            <span className="gc-streak">
              <Flame size={13} /> {g.streak} {PERIOD_UNIT[g.period]}
              {g.streak === 1 ? '' : 's'} in a row
            </span>
          ) : (
            <span className="faint" style={{ fontSize: 12 }}>
              {g.history.filter((h) => h.done).length}/{g.history.length} recent {PERIOD_UNIT[g.period]}s
            </span>
          )}
        </div>
      )}
      {g.metric === 'manual' && !manualDaily && (
        <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={plusOne}>
          <Plus /> Log one
        </button>
      )}
      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit goal" width={440}>
        <EditGoal g={g} onDone={() => setEditing(false)} />
      </Dialog>
    </div>
  );
}

function EditGoal({ g, onDone }: { g: GoalProgress; onDone: () => void }) {
  const ui = useUI();
  const toDisplay = (v: number) =>
    g.metric === 'earnings' ? String(v / 100) : g.metric === 'hours' || g.metric === 'gym_hours' || g.metric === 'screen_time' ? String(v / 60) : ['weight', 'exercise_weight', 'exercise_e1rm'].includes(g.metric) ? String(wVal(v)) : g.metric === 'waist' ? String(lVal(v)) : String(v);
  const fromDisplay = (s: string) => {
    const n = Number(s);
    return g.metric === 'earnings' ? toCents(s) ?? 0 : g.metric === 'hours' || g.metric === 'gym_hours' || g.metric === 'screen_time' ? n * 60 : ['weight', 'exercise_weight', 'exercise_e1rm'].includes(g.metric) ? wFromDisplay(n) : g.metric === 'waist' ? lFromDisplay(n) : n;
  };
  const [title, setTitle] = useState(g.title);
  const [target, setTarget] = useState(toDisplay(g.target));
  const save = async () => {
    try {
      await api.put(`/goals/${g.id}`, { title, target: fromDisplay(target) });
      await refreshAll();
      ui.toast('Goal updated');
      onDone();
    } catch (e) {
      ui.error(e);
    }
  };
  return (
    <div className="stack-16">
      <Field label="Name" htmlFor="eg-t">
        <input id="eg-t" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      {g.metric !== 'manual' || g.period !== 'day' ? (
        <Field label="Target" htmlFor="eg-v">
          <input id="eg-v" className="input num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ''))} />
        </Field>
      ) : null}
      <div className="form-foot">
        <button className="btn btn-secondary" onClick={onDone}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}
