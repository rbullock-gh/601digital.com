import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Smartphone, Star, Trophy } from 'lucide-react';
import { api, refreshAll } from '../lib/api.ts';
import { dateRange, dayDate, duration, hours, length, money, pct, plural, shortDate, weight } from '../lib/format.ts';
import { Card, Delta, Stat } from '../components/ui/primitives.tsx';
import { RatingBar } from '../components/charts/charts.tsx';
import { groupPRs, PRLine } from './shared.tsx';
import { MEASUREMENT_LABELS, type MeasurementKey } from '../../shared/types.ts';
import type { PeriodReport } from './types.ts';

export const QUESTIONS = {
  week: [
    { key: 'well', q: 'What went well?' },
    { key: 'improve', q: 'What could improve?' },
    { key: 'focus', q: 'What do I want to focus on next week?' },
  ],
  month: [
    { key: 'well', q: 'What went well?' },
    { key: 'improve', q: 'What do I want to improve?' },
    { key: 'biggest', q: 'Biggest accomplishment?' },
    { key: 'next', q: 'What do I want next month to look like?' },
  ],
  year: [
    { key: 'well', q: 'What went well this year?' },
    { key: 'improve', q: 'What do I want to do differently?' },
    { key: 'biggest', q: 'Biggest accomplishment?' },
    { key: 'next', q: 'What do I want next year to look like?' },
  ],
};

/** Written reflections. Saved permanently, as you type. */
export function Reflection({ kind, start, answers }: { kind: 'week' | 'month' | 'year'; start: string; answers: Record<string, string> }) {
  const [a, setA] = useState(answers);
  const [status, setStatus] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(a);
  useEffect(() => {
    setA(answers);
    latest.current = answers;
  }, [start]); // reset when the period changes
  const save = async () => {
    setStatus('Saving…');
    try {
      await api.put(`/reviews/${kind}/${start}`, { answers: latest.current });
      setStatus('Saved');
      refreshAll();
    } catch {
      setStatus('Not saved');
    }
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <Card title="Reflection" sub="Optional · saved permanently" actions={<span className="faint" style={{ fontSize: 12 }}>{status}</span>}>
      <div className="reflection">
        {QUESTIONS[kind].map(({ key, q }) => (
          <div key={key} className="field">
            <label htmlFor={`r-${key}`}>{q}</label>
            <textarea
              id={`r-${key}`}
              className="textarea"
              rows={3}
              value={a[key] ?? ''}
              onChange={(e) => {
                const next = { ...latest.current, [key]: e.target.value };
                latest.current = next;
                setA(next);
                setStatus('');
                window.clearTimeout(timer.current);
                timer.current = window.setTimeout(save, 900);
              }}
              onBlur={() => {
                window.clearTimeout(timer.current);
                save();
              }}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ReportStats({ r, compareLabel }: { r: PeriodReport; compareLabel: string }) {
  const t = r.totals;
  const p = r.previous;
  const weightChange = r.bodyChanges.find((c) => c.field === 'weightKg');
  return (
    <div className="card">
      <div className="report-stats">
        <Stat label="Money earned" value={money(t.earnedCents)} foot={<Delta current={t.earnedCents} previous={p.earnedCents} label={compareLabel} />} />
        <Stat label="Hours worked" value={`${hours(t.minutes)}h`} foot={<Delta current={t.minutes} previous={p.minutes} label={compareLabel} />} />
        <Stat label="Workouts" value={t.workouts} foot={t.gymMinutes ? `${duration(t.gymMinutes)} in the gym` : <Delta current={t.workouts} previous={p.workouts} label={compareLabel} />} />
        <Stat label="PRs" value={groupPRs(r.prs).length} foot={r.prs.length ? `${r.topExercises[0]?.name ?? ''}` : 'None this time'} />
        <Stat label="Good days" value={t.good} foot={r.ratings.pctGood != null ? `${pct(r.ratings.pctGood)} of rated days` : 'No ratings'} />
        <Stat label="Goals completed" value={r.goalsCompleted.length} />
        <Stat label="Weight" value={weightChange?.to ? weight(weightChange.to.value) : '—'} foot={weightChange?.change != null ? <Delta current={weightChange.change} previous={0} asPct={false} goodWhenUp={false} format={(v) => weight(v)} label="change" /> : undefined} />
        <Stat label="Per hour" value={r.avgRate ? money(r.avgRate) : '—'} foot="Earned ÷ hours worked" />
      </div>
      <div style={{ marginTop: 20 }}>
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
          <span className="faint">Days</span>
          <span className="num muted">
            <span className="rt g">{t.good} good</span> · <span className="rt o">{t.okay} okay</span> · <span className="rt b">{t.bad} bad</span>
            {r.ratings.unrated ? <span className="faint"> · {r.ratings.unrated} unrated</span> : null}
          </span>
        </div>
        <RatingBar good={t.good} okay={t.okay} bad={t.bad} height={8} />
      </div>
    </div>
  );
}

export function ReportDetails({ r }: { r: PeriodReport }) {
  const measures = r.bodyChanges.filter((c) => c.field !== 'weightKg' && c.field !== 'bodyFatPct' && c.change != null);
  return (
    <div className="grid grid-12" style={{ marginTop: 16 }}>
      <Card className="span-6" title="Projects">
        {r.projects.length ? (
          <div className="list">
            {r.projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="list-row">
                <span className="avatar-dot" style={{ background: p.color ?? 'var(--text-4)' }} />
                <span className="grow truncate title">{p.name}</span>
                <span className="faint num" style={{ fontSize: 12 }}>{duration(p.minutes)}</span>
                <span className="value">{money(p.cents)}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="faint" style={{ fontSize: 13 }}>No project work.</div>
        )}
        {r.completedProjects.length > 0 && (
          <div className="mt-16">
            <div className="eyebrow">Completed</div>
            {r.completedProjects.map((p) => (
              <div key={p.id} className="milestone">
                <Star size={13} /> <span className="grow">{p.name}</span> <span className="faint">{shortDate(p.date)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card className="span-6" title="Accomplishments">
        {r.accomplishments.length || r.goalsCompleted.length ? (
          <div className="stack-8">
            {r.accomplishments.map((a) => (
              <Link key={a.id} to={`/day/${a.date}`} className="milestone">
                {a.isMilestone ? <Star size={13} /> : <Trophy size={13} style={{ color: 'var(--text-3)' }} />}
                <span className="grow">{a.text}</span>
                <span className="faint nowrap">{shortDate(a.date)}</span>
              </Link>
            ))}
            {r.goalsCompleted.map((g, i) => (
              <div key={`${g.id}-${i}`} className="milestone">
                <span className="goal-check on" style={{ width: 14, height: 14 }} />
                <span className="grow">{g.title}</span>
                <span className="faint nowrap">{shortDate(g.date)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="faint" style={{ fontSize: 13 }}>Nothing recorded. Add wins from any day’s page.</div>
        )}
      </Card>
      <Card className="span-6" title="Strength PRs" sub={r.prs.length ? plural(groupPRs(r.prs).length, 'record') : undefined}>
        {r.prs.length ? groupPRs(r.prs).slice(0, 8).map((g) => <PRLine key={g.key} lead={g.lead} others={g.others} />) : <div className="faint" style={{ fontSize: 13 }}>No new records.</div>}
      </Card>
      <Card className="span-6" title="Body">
        {r.bodyChanges.length ? (
          <div className="measure-list">
            {r.bodyChanges.filter((c) => c.field === 'weightKg').map((c) => (
              <div key={c.field} className="measure-line">
                <span className="faint">Weight</span>
                <span className="num">{weight(c.from!.value)} → {weight(c.to!.value)}</span>
                <b className="num" style={{ textAlign: 'right' }}>{weight(c.change, { signed: true })}</b>
              </div>
            ))}
            {measures.map((c) => (
              <div key={c.field} className="measure-line">
                <span className="faint">{MEASUREMENT_LABELS[c.field as MeasurementKey]}</span>
                <span className="num">{length(c.from!.value)} → {length(c.to!.value)}</span>
                <b className="num" style={{ textAlign: 'right' }}>{length(c.change, { signed: true })}</b>
              </div>
            ))}
          </div>
        ) : (
          <div className="faint" style={{ fontSize: 13 }}>No body measurements in this period.</div>
        )}
      </Card>
      {(r.screen.logged > 0 || r.travel.length > 0) && (
        <>
          <Card className="span-6" title="Screen time" actions={<Link to="/screen-time" className="dash-more">Open</Link>}>
            {r.screen.avg != null ? (
              <div className="review-screen">
                <Smartphone />
                <div>
                  <div className="stat-value num">{duration(r.screen.avg)}</div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    a day on average · {plural(r.screen.logged, 'day')} logged
                  </div>
                </div>
                {r.screenPrev.avg != null && <Delta current={r.screen.avg} previous={r.screenPrev.avg} goodWhenUp={false} label="vs before" />}
              </div>
            ) : (
              <div className="faint" style={{ fontSize: 13 }}>Not logged in this period.</div>
            )}
          </Card>
          <Card className="span-6" title="Travel" sub={r.travel.length ? `${plural(r.travelStats.tripDays, 'day')} away` : undefined} actions={<Link to="/travel" className="dash-more">Map</Link>}>
            {r.travel.length ? (
              <div className="stack-8">
                {r.travel.map((v) => (
                  <Link key={v.id} to={`/travel?place=${v.placeId}`} className="milestone">
                    <MapPin size={13} style={{ color: 'var(--travel)' }} />
                    <span className="grow">{v.title && v.title !== v.placeName ? `${v.title} · ${v.placeName}` : v.placeName}</span>
                    <span className="faint nowrap">{dateRange(v.startDate, v.endDate)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="faint" style={{ fontSize: 13 }}>Home the whole time.</div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export function DayList({ r }: { r: PeriodReport }) {
  return (
    <div className="week-days">
      {r.days.map((d) => (
        <Link key={d.date} to={`/day/${d.date}`} className={`wd-row ${d.rating ? `r${d.rating}` : ''}`}>
          <span className={`rating-dot ${d.rating ? `r${d.rating}` : ''}`} />
          <span className="wd-date">{dayDate(d.date)}</span>
          <span className="faint num">{d.minutes ? duration(d.minutes) : '—'}</span>
          <span className="num">{d.cents ? money(d.cents) : ''}</span>
          <span className="faint">{d.workouts ? 'Workout' : ''}</span>
        </Link>
      ))}
    </div>
  );
}
