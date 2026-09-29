import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useDocumentTitle } from '../lib/hooks.ts';
import { dayDate, monthYear, num, plural, shortDate, weight, wUnit, wVal } from '../lib/format.ts';
import { Card, ErrorBox, PageHead, PageSkeleton, Stat } from '../components/ui/primitives.tsx';
import { Segmented } from '../components/ui/Segmented.tsx';
import { LineChart } from '../components/charts/charts.tsx';
import { groupPRs, PRLine } from '../features/shared.tsx';
import { estimate1RM } from '../../shared/fitness.ts';
import type { PR } from '../../shared/types.ts';
import type { ISODate } from '../../shared/dates.ts';

interface History {
  exercise: { id: number; name: string; muscleGroup: string | null; kind: string };
  stats: {
    sessions: number;
    totalSets: number;
    totalReps: number;
    volumeKg: number;
    bestWeight: { kg: number; reps: number | null; date: ISODate } | null;
    bestSet: { kg: number | null; reps: number | null; e1rm: number; date: ISODate } | null;
    firstDate: ISODate | null;
    lastDate: ISODate | null;
  };
  last: Session | null;
  sessions: Session[];
  prs: PR[];
}
interface Session {
  workoutId: number;
  workoutName: string;
  date: ISODate;
  sets: { weightKg: number | null; reps: number | null; rpe: number | null; isWarmup: boolean }[];
  topKg: number;
  bestE1rm: number | null;
  volumeKg: number;
  reps: number;
}

export default function ExercisePage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['exercise', id], queryFn: () => api.get<History>(`/exercises/${id}`) });
  const [metric, setMetric] = useState<'e1rm' | 'top' | 'volume'>('e1rm');
  useDocumentTitle(q.data?.exercise.name ?? 'Exercise');
  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const { exercise: ex, stats: s, sessions, prs, last } = q.data;
  const chron = [...sessions].reverse();
  const bodyweight = ex.kind === 'bodyweight' || !s.bestWeight;
  const points = chron
    .map((x) => ({ date: x.date, value: metric === 'e1rm' ? x.bestE1rm ?? 0 : metric === 'top' ? x.topKg : x.volumeKg }))
    .filter((p) => p.value > 0)
    .map((p) => ({ ...p, value: metric === 'volume' ? wVal(p.value)! : wVal(p.value)! }));
  const repsPoints = chron.map((x) => ({ date: x.date, value: Math.max(0, ...x.sets.filter((z) => !z.isWarmup).map((z) => z.reps ?? 0)) })).filter((p) => p.value > 0);
  const first = chron[0]?.bestE1rm;
  const latest = s.bestSet?.e1rm;

  return (
    <div className="page">
      <PageHead
        back={{ to: '/gym', label: 'Gym' }}
        title={ex.name}
        sub={[ex.muscleGroup, s.firstDate && `Since ${shortDate(s.firstDate, true)}`, plural(s.sessions, 'session')].filter(Boolean).join(' · ')}
      />
      <div className="card">
        <div className="stat-row" style={{ '--cols': 4 } as React.CSSProperties}>
          <Stat label="Last workout" value={last ? shortDate(last.date) : '—'} foot={last ? last.sets.filter((x) => !x.isWarmup).map((x) => `${x.weightKg != null ? wVal(x.weightKg) : 'BW'}×${x.reps}`).slice(0, 4).join(', ') : undefined} />
          <Stat label="Best weight" value={s.bestWeight ? weight(s.bestWeight.kg) : '—'} foot={s.bestWeight ? `× ${s.bestWeight.reps} · ${shortDate(s.bestWeight.date)}` : undefined} />
          <Stat label="Best set" value={s.bestSet ? `${wVal(s.bestSet.kg) ?? 'BW'} × ${s.bestSet.reps}` : '—'} foot={s.bestSet ? shortDate(s.bestSet.date) : undefined} />
          <Stat label="Estimated 1RM" value={latest ? weight(latest) : '—'} foot={first && latest && latest > first ? `+${weight(latest - first)} since first session` : 'Epley formula'} />
        </div>
        <div className="divider" />
        <div className="stat-row" style={{ '--cols': 4 } as React.CSSProperties}>
          <Stat size="sm" label="Sessions" value={s.sessions} />
          <Stat size="sm" label="Total sets" value={num(s.totalSets)} />
          <Stat size="sm" label="Total reps" value={num(s.totalReps)} />
          <Stat size="sm" label="Training volume" value={`${num(wVal(s.volumeKg) ?? 0)} ${wUnit()}`} />
        </div>
      </div>

      <Card
        className="mt-16"
        title="Progression"
        actions={
          !bodyweight && (
            <Segmented
              size="sm"
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'e1rm', label: 'Est. 1RM' },
                { value: 'top', label: 'Top weight' },
                { value: 'volume', label: 'Volume' },
              ]}
            />
          )
        }
      >
        {(bodyweight ? repsPoints : points).length > 1 ? (
          <LineChart
            ariaLabel={`${ex.name} progression`}
            height={260}
            area
            series={[{ name: bodyweight ? 'Best reps' : metric === 'e1rm' ? 'Estimated 1RM' : metric === 'top' ? 'Top weight' : 'Volume', color: 'var(--fitness)', points: bodyweight ? repsPoints : points }]}
            format={(v) => (bodyweight ? `${v} reps` : `${num(v, 1)} ${wUnit()}`)}
            axisFormat={(v) => num(v)}
            dateFormat={(d) => (d.length === 10 ? shortDate(d) : monthYear(d.slice(0, 7), true))}
          />
        ) : (
          <div className="faint">Log this exercise a few more times to see the trend.</div>
        )}
      </Card>

      <div className="grid grid-12" style={{ marginTop: 16 }}>
        <Card className="span-5" title="Personal records" sub={`${groupPRs(prs).length}`}>
          {prs.length ? groupPRs(prs).slice(0, 12).map((g) => <PRLine key={g.key} lead={g.lead} others={g.others} />) : <div className="faint" style={{ fontSize: 13 }}>No PRs yet — the first session is your baseline.</div>}
        </Card>
        <Card className="span-7 card-flush" title="History">
          <div className="history-list">
            {sessions.slice(0, 60).map((x) => (
              <Link key={x.workoutId} to={`/gym/workouts/${x.workoutId}`} className="history-row">
                <div>
                  <div style={{ fontWeight: 550 }}>{dayDate(x.date)}</div>
                  <div className="faint" style={{ fontSize: 12 }}>{x.workoutName}</div>
                </div>
                <div className="set-chips">
                  {x.sets.map((z, i) => (
                    <span key={i} className={`set-chip ${z.isWarmup ? 'warm' : ''} ${estimate1RM(z.weightKg, z.reps) === x.bestE1rm && !z.isWarmup ? 'best' : ''}`}>
                      {z.weightKg != null ? wVal(z.weightKg) : 'BW'}×{z.reps}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
