import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Camera, Check, Dumbbell, Flame, Play } from 'lucide-react';
import { api } from '../lib/api.ts';

import { useDocumentTitle } from '../lib/hooks.ts';
import { dayDate, duration, length, monthName, pct, plural, shortDate, weight } from '../lib/format.ts';
import { Card, Delta, Empty, ErrorBox, PageHead, PageSkeleton, Stat } from '../components/ui/primitives.tsx';
import { BarChart } from '../components/charts/charts.tsx';
import { groupPRs, PRLine } from '../features/shared.tsx';
import { MEASUREMENT_LABELS, type MeasurementKey, type PR } from '../../shared/types.ts';
import type { FieldChange, StrengthChange, WorkoutWithNames } from '../features/types.ts';
import type { ISODate } from '../../shared/dates.ts';

interface GymSummary {
  week: { n: number; minutes: number };
  month: { n: number; minutes: number };
  year: { n: number; minutes: number };
  total: number;
  firstDate: string | null;
  lastDate: string | null;
  daysSinceLast: number | null;
  weekStreak: number;
  weeklyTarget: number;
  weeks: { start: ISODate; count: number }[];
  weight: { current: { date: ISODate; value: number } | null; change30: number | null };
  measurements: FieldChange[];
  recentPRs: PR[];
  recentWorkouts: WorkoutWithNames[];
  topExercises: { id: number; name: string; sessions: number; sets: number; volumeKg: number }[];
  strength: StrengthChange[];
  photo: { month: string; count: number; complete: boolean };
}

export default function Gym() {
  const navigate = useNavigate();
  useDocumentTitle('Gym');
  const q = useQuery({ queryKey: ['gym-summary'], queryFn: () => api.get<GymSummary>('/gym/summary') });
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => api.get<{ name: string; lastDate: string; workoutId: number }[]>('/workouts/templates') });
  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const g = q.data;

  return (
    <div className="page">
      <PageHead
        title="Gym"
        sub={g.total ? `${plural(g.total, 'workout')} since ${shortDate(g.firstDate!, true)}` : 'Log a workout and your history starts here.'}
        actions={
          <button className="btn btn-primary" onClick={() => navigate('/gym/new')}>
            <Play /> Start workout
          </button>
        }
      />

      {templates.data && templates.data.length > 0 && (
        <div className="quick-repeat">
          <span className="faint" style={{ fontSize: 12 }}>Quick start</span>
          {templates.data.slice(0, 5).map((t) => (
            <Link key={t.name} to={`/gym/new?template=${t.workoutId}&name=${encodeURIComponent(t.name)}`} className="chip">
              {t.name}
            </Link>
          ))}
        </div>
      )}

      <div className="card">
        <div className="stat-row" style={{ '--cols': 5 } as React.CSSProperties}>
          <Stat label="This week" value={<>{g.week.n}<small>/ {g.weeklyTarget}</small></>} foot={g.week.n >= g.weeklyTarget ? <span className="pos row" style={{ gap: 4 }}><Check size={13} /> Target met</span> : `${g.weeklyTarget - g.week.n} to go`} />
          <Stat label="This month" value={g.month.n} foot={duration(g.month.minutes)} />
          <Stat label="Weekly streak" value={<span className="row" style={{ gap: 6 }}>{g.weekStreak}{g.weekStreak >= 3 && <Flame size={18} style={{ color: 'var(--fitness)' }} />}</span>} foot={`Weeks with ${g.weeklyTarget}+ workouts`} />
          <Stat label="Current weight" value={g.weight.current ? weight(g.weight.current.value) : '—'} foot={g.weight.change30 != null ? <Delta current={g.weight.change30} previous={0} asPct={false} goodWhenUp={false} format={(v) => weight(v)} label="30 days" /> : <Link to="/body" className="link">Log weight</Link>} />
          <Stat label="Total workouts" value={g.total.toLocaleString()} foot={g.daysSinceLast != null ? (g.daysSinceLast === 0 ? 'Trained today' : `Last ${g.daysSinceLast}d ago`) : undefined} />
        </div>
      </div>

      <div className="grid grid-12" style={{ marginTop: 16 }}>
        <Card className="span-7" title="Workouts per week" sub="Last 12 weeks">
          <BarChart
            ariaLabel="Workouts per week"
            data={g.weeks.map((w) => ({ key: w.start, label: shortDate(w.start).replace(/,.*/, ''), value: w.count }))}
            format={(v) => plural(v, 'workout')}
            axisFormat={(v) => String(v)}
            integer
            color="var(--fitness)"
            highlight={g.weeks[g.weeks.length - 1]?.start}
            target={g.weeklyTarget ? { value: g.weeklyTarget, label: `Target ${g.weeklyTarget}` } : undefined}
            tooltip={(d) => (
              <>
                <div className="tip-title">Week of {shortDate(d.key)}</div>
                <div className="tip-row">Workouts <b>{d.value}</b></div>
              </>
            )}
          />
        </Card>
        <Card className="span-5" title="Recent PRs" actions={<Link to="/gym/prs" className="dash-more">All PRs <ArrowRight /></Link>}>
          {g.recentPRs.length ? (
            groupPRs(g.recentPRs).slice(0, 5).map((x) => <PRLine key={x.key} lead={x.lead} others={x.others} />)
          ) : (
            <div className="faint" style={{ fontSize: 13 }}>PRs are detected automatically as you log sets.</div>
          )}
        </Card>

        <Card className="span-7" title="Strength" sub="Estimated 1RM, last 3 months">
          {g.strength.length ? (
            <div className="strength-table">
              {g.strength.map((s) => (
                <Link key={s.id} to={`/gym/exercises/${s.id}`} className="strength-line">
                  <span className="truncate" style={{ fontWeight: 550 }}>{s.name}</span>
                  <span className="faint num">{weight(s.startE1rm, { unit: false })} → {weight(s.endE1rm)}</span>
                  <span className={`num ${s.change >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 600, textAlign: 'right' }}>
                    {s.change >= 0 ? '+' : ''}
                    {weight(s.change, { unit: false })} · {pct(s.pct)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="faint" style={{ fontSize: 13 }}>Train an exercise a few times to see its trend.</div>
          )}
        </Card>
        <Card className="span-5" title="Most trained" sub="Last 90 days">
          {g.topExercises.map((e) => (
            <Link key={e.id} to={`/gym/exercises/${e.id}`} className="list-row" style={{ display: 'flex' }}>
              <span className="grow truncate" style={{ fontWeight: 550 }}>{e.name}</span>
              <span className="faint num" style={{ fontSize: 12 }}>{e.sets} sets</span>
              <span className="num" style={{ width: 84, textAlign: 'right' }}>{plural(e.sessions, 'session')}</span>
            </Link>
          ))}
          {!g.topExercises.length && <div className="faint">—</div>}
        </Card>

        <Card className="span-7" title="Recent workouts">
          {g.recentWorkouts.length ? (
            <div className="list">
              {g.recentWorkouts.map((w) => (
                <Link key={w.id} to={`/gym/workouts/${w.id}`} className="list-row interactive">
                  <span className="icon-tile" style={{ '--c': 'var(--fitness)', '--c-soft': 'var(--fitness-soft)' } as React.CSSProperties}>
                    <Dumbbell />
                  </span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <div className="title">{w.name}</div>
                    <div className="meta truncate">{dayDate(w.date)} · {w.exercises.join(', ')}</div>
                  </span>
                  <span className="value">
                    <div>{w.durationMinutes ? duration(w.durationMinutes) : ''}</div>
                    <div className="meta">{w.prCount ? `${w.prCount} PR${w.prCount > 1 ? 's' : ''}` : `${w.setCount} sets`}</div>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <Empty icon={<Dumbbell />} title="No workouts yet" action={<button className="btn btn-primary btn-sm" onClick={() => navigate('/gym/new')}>Start your first workout</button>} />
          )}
        </Card>
        <div className="span-5 stack-16">
          <Card title="Body" sub="Last 90 days" actions={<Link to="/body" className="dash-more">Body <ArrowRight /></Link>}>
            {g.measurements.length ? (
              <div className="measure-list">
                {g.measurements.map((m) => (
                  <div key={m.field} className="measure-line">
                    <span className="faint">{MEASUREMENT_LABELS[m.field as MeasurementKey]}</span>
                    <span className="num">{length(m.to!.value)}</span>
                    <span className={`num ${m.change == null ? 'faint' : ''}`} style={{ textAlign: 'right' }}>
                      {m.change != null ? length(m.change, { signed: true }) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="faint" style={{ fontSize: 13 }}>No measurements yet.</div>
            )}
          </Card>
          <Link to={`/photos/${g.photo.month}${g.photo.complete ? '' : '?add=1'}`} className={`photo-status ${g.photo.complete ? 'ok' : ''}`} style={{ marginTop: 0 }}>
            {g.photo.complete ? <Check size={15} /> : <Camera size={15} />}
            {g.photo.complete ? `${monthName(g.photo.month)} progress photos complete` : `${monthName(g.photo.month)} progress photos not added yet`}
            <ArrowRight size={14} style={{ marginLeft: 'auto' }} />
          </Link>
        </div>
      </div>
    </div>
  );
}
