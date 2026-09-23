import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Dumbbell, Flame, Square, Star } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useUI } from '../lib/ui.tsx';
import { useDocumentTitle, useTick } from '../lib/hooks.ts';
import { dateRange, duration, greeting, hours, longDate, money, monthName, pct, plural, shortDate, weight } from '../lib/format.ts';
import { Card, Delta, ErrorBox, Meter, PageSkeleton, Stat } from '../components/ui/primitives.tsx';
import { RatingBar, Sparkline } from '../components/charts/charts.tsx';
import { YearGrid } from '../components/YearGrid.tsx';
import { GoalRow, groupPRs, PhotoReminder, PRLine, usePhotoReminder, WeekStrip } from '../features/shared.tsx';
import { RateDay } from '../features/RateDay.tsx';
import { elapsedMs, fmtElapsed, useTimerActions } from '../components/Timer.tsx';
import { addDays, eachDay, yearOf } from '../../shared/dates.ts';
import type { Dashboard as D, YearGridData } from '../features/types.ts';
import type { Insight } from '../../shared/types.ts';

export default function Dashboard() {
  const boot = useBoot();
  const ui = useUI();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<D>('/dashboard') });
  const year = useQuery({ queryKey: ['year', yearOf(boot.today)], queryFn: () => api.get<YearGridData>(`/year/${yearOf(boot.today)}`) });
  const insights = useQuery({ queryKey: ['insights'], queryFn: () => api.get<Insight[]>('/insights') });
  useDocumentTitle('Dashboard');
  const showPhoto = usePhotoReminder(q.data?.month.photo);

  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const d = q.data;
  const name = boot.settings.name;
  const hour = new Date().getHours();
  const evening = hour >= 17 || hour < 4;

  const weekDays = eachDay(d.week.range.start, d.week.range.end).map(
    (date) => d.recent.find((r) => r.date === date) ?? { date, minutes: 0, cents: 0, workouts: 0, rating: null },
  );
  const todayWorkout = d.today.workouts[0];
  const goalsTotal = d.today.dailyGoals.length;
  const goalsDone = d.today.dailyGoals.filter((g) => g.done).length;
  const mt = d.month.totals;
  const yt = d.year.totals;

  return (
    <div className="page dashboard">
      <header className="greeting">
        <div>
          <h1 className="serif">
            {greeting()}
            {name ? `, ${name}` : ''}
          </h1>
          <div className="greeting-date">{longDate(boot.today)}</div>
        </div>
        {d.goodStreak >= 3 && (
          <div className="streak-chip" title="Consecutive Good days">
            <Flame /> {d.goodStreak} good days in a row
          </div>
        )}
      </header>

      <div className="stack-16">
        {showPhoto && <PhotoReminder status={d.month.photo} />}
        {d.yesterdayUnrated && !evening && (
          <div className="reminder">
            <div className="grow">
              <div className="reminder-title">Yesterday isn’t rated yet.</div>
              <div className="reminder-sub">{longDate(addDays(boot.today, -1))}</div>
            </div>
            <div style={{ width: 'min(340px, 100%)' }}>
              <RateDay date={addDays(boot.today, -1)} rating={null} journal={null} title="" compact />
            </div>
          </div>
        )}
        <LiveTimer />
      </div>

      {/* ── Today ── */}
      <section className="dash-section">
        <div className="dash-label">
          <span>Today</span>
          <Link to="/today" className="dash-more">
            Open today <ArrowRight />
          </Link>
        </div>
        <div className="card today-card">
          <div className="today-stats">
            <Stat label="Worked" value={d.today.minutes ? duration(d.today.minutes) : '0h'} foot={d.today.sessions ? plural(d.today.sessions, 'session') : 'Nothing logged yet'} />
            <Stat label="Earned" value={money(d.today.earnedCents)} foot={d.today.minutes && d.today.earnedCents ? `${money(Math.round((d.today.earnedCents * 60) / d.today.minutes))}/h` : ' '} />
            <Stat
              label="Workout"
              value={
                todayWorkout ? (
                  <span className="row" style={{ gap: 6 }}>
                    <Check size={20} className="pos" /> Done
                  </span>
                ) : (
                  <span className="faint">Rest</span>
                )
              }
              foot={todayWorkout ? `${todayWorkout.name}${todayWorkout.durationMinutes ? ` · ${duration(todayWorkout.durationMinutes)}` : ''}` : <Link to="/gym/new" className="link">Log a workout</Link>}
            />
            <Stat label="Daily goals" value={goalsTotal ? `${goalsDone}/${goalsTotal}` : '—'} foot={goalsTotal ? (goalsDone === goalsTotal ? 'All done' : `${goalsTotal - goalsDone} to go`) : <Link to="/goals" className="link">Add a goal</Link>} />
          </div>
          <div className="today-rate">
            {d.today.rating || evening ? (
              <RateDay date={boot.today} rating={d.today.rating} journal={null} title={d.today.rating ? 'Today' : 'How was today?'} compact />
            ) : (
              <div className="rate-later">
                <div className="rate-title">Day rating</div>
                <button className="btn btn-secondary btn-sm" onClick={() => ui.openAdd('day')}>
                  Rate today
                </button>
                <div className="faint" style={{ fontSize: 12 }}>Best done in the evening.</div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-12 dash-grid">
        {/* ── Week ── */}
        <section className="span-6 keep">
          <div className="dash-label">
            <span>This week</span>
            <span className="faint">{dateRange(d.week.range.start, d.week.range.end)}</span>
            <Link to={`/reviews/week/${boot.today}`} className="dash-more">
              Review <ArrowRight />
            </Link>
          </div>
          <div className="card">
            <div className="kv-grid three">
              <Stat size="sm" label="Hours" value={hours(d.week.totals.minutes)} foot={<Delta current={d.week.totals.minutes} previous={d.week.previous.minutes} />} />
              <Stat size="sm" label="Earned" value={money(d.week.totals.earnedCents)} foot={<Delta current={d.week.totals.earnedCents} previous={d.week.previous.earnedCents} />} />
              <Stat
                size="sm"
                label="Workouts"
                value={
                  <>
                    {d.week.totals.workouts}
                    {d.week.workoutTarget > 0 && <small>/ {d.week.workoutTarget}</small>}
                  </>
                }
                foot={d.week.workoutTarget ? <Meter value={d.week.totals.workouts / d.week.workoutTarget} done={d.week.totals.workouts >= d.week.workoutTarget} thin color="var(--fitness)" /> : null}
              />
              <Stat size="sm" label="Good days" value={d.week.totals.good} foot={`${d.week.totals.rated} rated`} />
              <Stat size="sm" label="Goals completed" value={d.week.goalsCompleted} />
            </div>
            <div className="faint" style={{ fontSize: 11, marginTop: 14 }}>Changes compare with the same days of last week.</div>
            <WeekStrip days={weekDays} today={boot.today} />
          </div>
        </section>

        {/* ── Month ── */}
        <section className="span-6 keep">
          <div className="dash-label">
            <span>{monthName(boot.today.slice(0, 7))}</span>
            <Link to={`/reviews/month/${boot.today.slice(0, 7)}`} className="dash-more">
              Review <ArrowRight />
            </Link>
          </div>
          <div className="card">
            <div className="month-hero">
              <Stat
                size="lg"
                label="Earned"
                value={money(mt.earnedCents)}
                foot={
                  <>
                    <Delta current={mt.earnedCents} previous={d.month.previous.earnedCents} label="vs same point last month" />
                  </>
                }
              />
              {d.month.projection && (
                <div className="projection" title={`Estimate: ${money(d.month.projection.perDayCents)} per day so far × ${d.month.projection.totalDays} days`}>
                  <span className="estimate">Estimate</span>
                  <div className="projection-v">{money(d.month.projection.projectedCents)}</div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    projected at {money(d.month.projection.perDayCents)}/day
                  </div>
                </div>
              )}
            </div>
            <div className="kv-grid three">
              <Stat size="sm" label="Hours" value={hours(mt.minutes)} foot={`${mt.workDays} days worked`} />
              <Stat size="sm" label="Workouts" value={mt.workouts} foot={mt.gymMinutes ? `${hours(mt.gymMinutes)}h in the gym` : ' '} />
              <Stat
                size="sm"
                label="Weight"
                value={d.month.weight ? weight(d.month.weight.current) : '—'}
                foot={d.month.weight?.change != null ? <Delta current={d.month.weight.change} previous={0} asPct={false} format={(v) => weight(v)} goodWhenUp={false} label="this month" /> : <Link className="link" to="/body">Log weight</Link>}
              />
            </div>
            <div className="month-days">
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
                <span className="faint">Days</span>
                <span className="muted num">
                  <span className="rt g">{mt.good} good</span> · <span className="rt o">{mt.okay} okay</span> · <span className="rt b">{mt.bad} bad</span>
                </span>
              </div>
              <RatingBar good={mt.good} okay={mt.okay} bad={mt.bad} height={8} />
            </div>
            <Link to={`/photos/${d.month.photo.month}${d.month.photo.complete ? '' : '?add=1'}`} className={`photo-status ${d.month.photo.complete ? 'ok' : ''}`}>
              {d.month.photo.complete ? <Check size={15} /> : <span className="dot" style={{ '--c': 'var(--okay)' } as React.CSSProperties} />}
              {d.month.photo.complete ? `${monthName(d.month.photo.month)} progress photos complete` : `${monthName(d.month.photo.month)} photos ${d.month.photo.count ? `${d.month.photo.count}/3 added` : 'not added yet'}`}
              <ArrowRight size={14} style={{ marginLeft: 'auto' }} />
            </Link>
            {d.month.goals.length > 0 && (
              <div className="stack-16" style={{ marginTop: 18 }}>
                {d.month.goals.slice(0, 3).map((g) => (
                  <GoalRow key={g.id} g={g} compact />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Year ── */}
        <section className="span-12">
          <div className="dash-label">
            <span>{yearOf(boot.today)}</span>
            <Link to={`/wrapped/${yearOf(boot.today)}`} className="dash-more">
              Year in review <ArrowRight />
            </Link>
          </div>
          <div className="card year-card-dash">
            <div className="year-left">
              <div className="kv-grid two">
                <Stat size="sm" label="Earned" value={money(yt.earnedCents, { compact: true })} foot={d.year.projection ? <span className="row" style={{ gap: 6 }}><span className="estimate">Est.</span>{money(d.year.projection.projectedCents, { compact: true })} for the year</span> : null} />
                <Stat size="sm" label="Hours worked" value={num0(yt.minutes / 60)} foot={`${yt.workDays} days`} />
                <Stat size="sm" label="Workouts" value={yt.workouts} foot={`${hours(yt.gymMinutes)} gym hours`} />
                <Stat size="sm" label="Good days" value={d.year.ratings.good} foot={d.year.ratings.pctGood != null ? `${pct(d.year.ratings.pctGood)} of rated days` : 'No ratings yet'} />
                <Stat size="sm" label="Goals completed" value={d.year.goalsCompleted} />
                <Stat size="sm" label="PRs" value={yt.prs} foot={d.year.ratings.longestStreak.length ? `Longest good streak ${d.year.ratings.longestStreak.length}d` : undefined} />
              </div>
              {d.year.strength.length > 0 && (
                <div className="strength-mini">
                  {d.year.strength.map((s) => (
                    <Link to={`/gym/exercises/${s.id}`} key={s.id} className="strength-row">
                      <span className="truncate">{s.name}</span>
                      <span className="faint num">
                        {weight(s.startE1rm, { unit: false })} → {weight(s.endE1rm)}
                      </span>
                      <span className={`num ${s.pct >= 0 ? 'pos' : 'neg'}`}>
                        {s.pct >= 0 ? '+' : ''}
                        {pct(s.pct)}
                      </span>
                    </Link>
                  ))}
                  <div className="faint" style={{ fontSize: 11 }}>Estimated 1RM, start of year → now</div>
                </div>
              )}
            </div>
            <div className="year-right">
              {year.data && (
                <Link to="/year" className="year-mini" aria-label="Open Year at a Glance">
                  <YearGrid year={year.data.year} days={year.data.days} today={boot.today} compact />
                </Link>
              )}
              {d.year.milestones.length > 0 && (
                <div className="milestones">
                  {d.year.milestones.slice(0, 3).map((m) => (
                    <Link to={`/day/${m.date}`} key={m.id} className="milestone">
                      <Star size={13} />
                      <span className="truncate">{m.text}</span>
                      <span className="faint nowrap">{shortDate(m.date)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Goals & highlights ── */}
        <section className="span-7">
          <div className="dash-label">
            <span>Goals</span>
            <Link to="/goals" className="dash-more">
              All goals <ArrowRight />
            </Link>
          </div>
          <Card>
            {d.goals.length ? (
              <div className="stack-16">
                {d.goals.map((g) => (
                  <GoalRow key={g.id} g={g} />
                ))}
              </div>
            ) : (
              <div className="empty empty-sm">
                <h3>No goals yet</h3>
                <p>Goals track themselves from what you log — income, hours, workouts, lifts.</p>
                <button className="btn btn-secondary btn-sm" onClick={() => ui.openAdd('goal')}>
                  Create a goal
                </button>
              </div>
            )}
          </Card>
        </section>
        <section className="span-5">
          <div className="dash-label">
            <span>Highlights</span>
            <Link to="/insights" className="dash-more">
              Insights <ArrowRight />
            </Link>
          </div>
          <Card>
            <div className="stack-16">
              {insights.data?.slice(0, 2).map((i) => (
                <div key={i.id} className="insight-mini">
                  <div>{i.text}</div>
                  {i.correlation && <span className="corr-tag">Correlation</span>}
                </div>
              ))}
              {d.recentPRs.length > 0 && (
                <div>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>Recent PRs</div>
                  {groupPRs(d.recentPRs)
                    .slice(0, 3)
                    .map((g) => (
                      <PRLine key={g.key} lead={g.lead} others={g.others} />
                    ))}
                </div>
              )}
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Last 14 days · hours worked</div>
                <Sparkline values={d.recent.map((r) => r.minutes)} bars color="var(--work)" height={36} />
              </div>
              {!insights.data?.length && !d.recentPRs.length && (
                <div className="faint" style={{ fontSize: 13 }}>
                  <Dumbbell size={14} style={{ display: 'inline', verticalAlign: -2 }} /> Highlights appear as your history grows.
                </div>
              )}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}

function num0(v: number) {
  return Math.round(v).toLocaleString();
}

function LiveTimer() {
  const { timer, projects } = useBoot();
  const a = useTimerActions();
  useTick(1000, !!timer && !timer.pausedAt);
  if (!timer) return null;
  const p = projects.find((x) => x.id === timer.projectId);
  return (
    <div className="reminder live-timer">
      <span className={`timer-live ${timer.pausedAt ? 'paused' : ''}`} />
      <div className="grow">
        <div className="reminder-title num">{fmtElapsed(elapsedMs(timer))}</div>
        <div className="reminder-sub">{timer.pausedAt ? 'Paused' : 'Working now'}{p ? ` · ${p.name}` : ''}</div>
      </div>
      <button className="btn btn-primary btn-sm" onClick={a.stop}>
        <Square /> Stop work
      </button>
    </div>
  );
}
