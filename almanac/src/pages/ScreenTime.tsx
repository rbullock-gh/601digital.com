import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Smartphone, Target } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useUI } from '../lib/ui.tsx';
import { useDocumentTitle } from '../lib/hooks.ts';
import { dayDate, duration, shortDate } from '../lib/format.ts';
import { Card, Delta, Empty, ErrorBox, Meter, PageHead, PageSkeleton, Stat } from '../components/ui/primitives.tsx';
import { BarChart, RankList } from '../components/charts/charts.tsx';
import { goalNumbers, goalPeriodLabel } from '../features/shared.tsx';
import { addDays, weekday, WEEKDAYS, WEEKDAYS_SHORT } from '../../shared/dates.ts';
import type { GoalProgress } from '../../shared/types.ts';
import type { ScreenSummary } from '../features/types.ts';

const hAxis = (v: number) => `${+(v / 60).toFixed(1)}h`;

export default function ScreenTime() {
  const boot = useBoot();
  const ui = useUI();
  useDocumentTitle('Screen Time');
  const q = useQuery({ queryKey: ['screen'], queryFn: () => api.get<ScreenSummary>('/screen') });
  const goals = useQuery({ queryKey: ['goals', false], queryFn: () => api.get<GoalProgress[]>('/goals') });
  const screenGoals = (goals.data ?? []).filter((g) => g.metric === 'screen_time' && g.status === 'active');
  const target = screenGoals.length ? Math.min(...screenGoals.map((g) => g.target)) : null;

  // Monday-first weekday order when the week starts on Monday.
  const weekdays = useMemo(() => {
    if (!q.data) return [];
    const order = boot.settings.weekStart === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
    return order.map((wd) => ({ key: String(wd), label: WEEKDAYS_SHORT[wd], value: q.data!.byWeekday[wd].avg ?? 0 }));
  }, [q.data, boot.settings.weekStart]);

  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const s = q.data;
  const log = (date?: string) => ui.openAdd('screen', { direct: true, ...(date ? { date } : {}) });
  const latest = s.today ?? s.yesterday;
  const hasAny = s.recent.length > 0;

  return (
    <div className="page">
      <PageHead
        title="Screen Time"
        sub="Lower is better. Copy one number a day from your phone’s Screen Time report."
        actions={
          <button className="btn btn-primary" onClick={() => log(s.today ? undefined : s.yesterday ? undefined : addDays(boot.today, -1))}>
            <Plus /> Log screen time
          </button>
        }
      />
      {!hasAny ? (
        <Card>
          <Empty
            icon={<Smartphone />}
            title="No screen time logged yet"
            action={
              <button className="btn btn-primary btn-sm" onClick={() => log(addDays(boot.today, -1))}>
                Log yesterday
              </button>
            }
          >
            On iPhone: Settings → Screen Time → See All Activity. On Android: Settings → Digital Wellbeing. It takes ten seconds, and a few weeks of it shows real patterns.
          </Empty>
        </Card>
      ) : (
        <>
          <div className="card">
            <div className="stat-row" style={{ '--cols': 4 } as React.CSSProperties}>
              <Stat
                label={s.today ? 'Today' : 'Yesterday'}
                value={latest ? duration(latest.minutes) : '—'}
                foot={
                  latest ? (
                    target != null ? (
                      <span className={latest.minutes <= target ? 'pos' : 'neg'}>{latest.minutes <= target ? `${duration(target - latest.minutes)} under target` : `${duration(latest.minutes - target)} over target`}</span>
                    ) : latest.pickups != null ? (
                      `${latest.pickups} pickups`
                    ) : (
                      shortDate(latest.date)
                    )
                  ) : (
                    <button className="link-btn" onClick={() => log(addDays(boot.today, -1))}>
                      Log yesterday
                    </button>
                  )
                }
              />
              <Stat
                label="This week"
                value={s.week.avg != null ? duration(s.week.avg) : '—'}
                foot={
                  s.week.avg != null && s.lastWeek.avg != null ? (
                    <Delta current={s.week.avg} previous={s.lastWeek.avg} goodWhenUp={false} label="vs last week" />
                  ) : (
                    `${s.week.logged} days logged · daily avg`
                  )
                }
              />
              <Stat
                label="Last 30 days"
                value={s.last30.avg != null ? duration(s.last30.avg) : '—'}
                foot={s.last30.avg != null && s.prev30.avg != null ? <Delta current={s.last30.avg} previous={s.prev30.avg} goodWhenUp={false} label="vs 30 days before" /> : 'daily average'}
              />
              <Stat label="Pickups" value={s.pickupsAvg != null ? Math.round(s.pickupsAvg) : '—'} foot="per day, last 30 days" />
            </div>
          </div>

          <div className="grid grid-12 section" style={{ marginTop: 16 }}>
            <Card className="span-8" title="Last 30 days" sub={target != null ? `Dashed line: your ${duration(target)} target` : 'Daily total'}>
              <BarChart
                ariaLabel="Screen time per day, last 30 days"
                data={s.daily.map((d) => ({ key: d.date, label: shortDate(d.date).replace(/,.*/, ''), value: d.minutes ?? 0 }))}
                color="var(--screen)"
                height={220}
                format={(v) => duration(v)}
                axisFormat={hAxis}
                tickUnit={60}
                minMax={120}
                target={target != null ? { value: target, label: `${duration(target, { short: true })} target` } : undefined}
                onSelect={(k) => log(k)}
                tooltip={(d) => {
                  const day = s.daily.find((x) => x.date === d.key);
                  return (
                    <>
                      <div className="tip-title">{dayDate(d.key)}</div>
                      <div className="tip-row">{day?.minutes == null ? <span className="faint">Not logged · click to add</span> : <b>{duration(d.value)}</b>}</div>
                      {day?.minutes != null && target != null && <div className="tip-row faint">{day.minutes <= target ? 'Under target' : `${duration(day.minutes - target)} over`}</div>}
                    </>
                  );
                }}
              />
            </Card>
            <Card className="span-4" title="Your target" sub={screenGoals.length ? undefined : 'Optional'}>
              {screenGoals.length ? (
                <div className="stack-12">
                  {screenGoals.map((g) => (
                    <div key={g.id} className="st-goal">
                      <div className="row" style={{ gap: 8 }}>
                        <b className="grow">{g.title}</b>
                        {g.done && g.current > 0 ? <span className="badge badge-good">On track</span> : g.current > 0 ? <span className="badge badge-bad">Over</span> : null}
                      </div>
                      <div className="faint num" style={{ fontSize: 12 }}>
                        {goalPeriodLabel(g)} · {goalNumbers(g).join('')}
                      </div>
                      <Meter value={g.pct} done={g.done} label={g.title} />
                      {g.history && g.history.length > 1 && (
                        <div className="faint" style={{ fontSize: 12 }}>
                          {g.streak ? `${g.streak} in a row under target · ` : ''}
                          {g.history.filter((h) => h.done).length} of the last {g.history.length} {g.period === 'day' ? 'days' : `${g.period}s`}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="faint" style={{ fontSize: 12 }}>
                    Goals use your average over the days you log. A period passes when it stays under the line.
                  </div>
                </div>
              ) : (
                <Empty small icon={<Target />} title="Set a daily limit" action={<button className="btn btn-secondary btn-sm" onClick={() => ui.openAdd('goal', { direct: true })}>New goal</button>}>
                  Choose “Screen time” when creating a goal — for example, under 3 hours a day, checked weekly.
                </Empty>
              )}
              {s.lowest && s.highest && s.lowest.date !== s.highest.date && (
                <div className="st-extremes">
                  <div>
                    <span className="faint">Lightest day</span>
                    <b className="num">{duration(s.lowest.minutes)}</b>
                    <span className="faint">{shortDate(s.lowest.date)}</span>
                  </div>
                  <div>
                    <span className="faint">Heaviest day</span>
                    <b className="num">{duration(s.highest.minutes)}</b>
                    <span className="faint">{shortDate(s.highest.date)}</span>
                  </div>
                </div>
              )}
            </Card>

            <Card className="span-7" title="Weekly average" sub="Last 12 weeks">
              <BarChart
                ariaLabel="Average daily screen time per week"
                data={s.weeks.map((w) => ({ key: w.start, label: shortDate(w.start).replace(/,.*/, ''), value: w.avg ?? 0 }))}
                color="var(--screen)"
                format={(v) => duration(v)}
                axisFormat={hAxis}
                tickUnit={60}
                minMax={120}
                highlight={s.weeks[s.weeks.length - 1]?.start}
                target={target != null ? { value: target, label: `${duration(target, { short: true })}` } : undefined}
                tooltip={(d) => {
                  const w = s.weeks.find((x) => x.start === d.key)!;
                  return (
                    <>
                      <div className="tip-title">Week of {shortDate(d.key)}</div>
                      <div className="tip-row">{w.avg == null ? <span className="faint">Nothing logged</span> : <>Averaged <b>{duration(w.avg)}</b> a day</>}</div>
                      {w.logged > 0 && <div className="tip-row faint">{w.logged} of 7 days logged</div>}
                    </>
                  );
                }}
              />
            </Card>
            <Card className="span-5" title="Typical week" sub="Average by weekday, last 90 days">
              <BarChart
                ariaLabel="Average screen time by weekday"
                data={weekdays}
                color="var(--screen)"
                format={(v) => duration(v)}
                axisFormat={hAxis}
                tickUnit={60}
                minMax={120}
                labelEvery={1}
                highlight={String(weekday(boot.today))}
                tooltip={(d) => (
                  <>
                    <div className="tip-title">{WEEKDAYS[Number(d.key)]}s</div>
                    <div className="tip-row">
                      Average <b>{duration(d.value)}</b>
                    </div>
                  </>
                )}
              />
            </Card>

            <Card className="span-5" title="Where the time goes" sub="Average per day, last 30 days">
              {s.categories.length ? (
                <RankList items={s.categories.map((c) => ({ key: c.name, label: c.name, value: c.avg }))} format={(v) => duration(v)} color="var(--screen)" />
              ) : (
                <div className="faint">Add a category breakdown when you log to see this.</div>
              )}
            </Card>
            <Card className="span-7" flush title="History" sub="Click a day to edit">
              <div className="st-history">
                {s.recent.map((d) => {
                  const top = Object.entries(d.categories).sort((a, b) => b[1] - a[1]).slice(0, 3);
                  return (
                    <button key={d.date} className="session-row" onClick={() => log(d.date)}>
                      <span className="sr-time num">{dayDate(d.date)}</span>
                      <span className="sr-main">
                        <span className="title">
                          {duration(d.minutes)}
                          {target != null && <span className={`st-flag ${d.minutes <= target ? 'under' : 'over'}`}>{d.minutes <= target ? 'under' : 'over'}</span>}
                        </span>
                        <span className="sr-meta">
                          {[d.pickups != null ? `${d.pickups} pickups` : null, ...top.map(([k, v]) => `${k} ${duration(v)}`)].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
