import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Sparkles, Star, Trophy } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useDocumentTitle } from '../lib/hooks.ts';
import { dateRange, dayDate, duration, length, longDate, money, monthName, num, pct, plural, shortDate, weight } from '../lib/format.ts';
import { ErrorBox, PageSkeleton } from '../components/ui/primitives.tsx';
import { BarChart, RatingBar } from '../components/charts/charts.tsx';
import { YearGrid } from '../components/YearGrid.tsx';
import { Reflection } from '../features/ReviewParts.tsx';
import { TravelMap } from '../components/TravelMap.tsx';
import { useTravel } from '../features/lifeForms.tsx';
import { groupPRs, prText } from '../features/shared.tsx';
import { addDays } from '../../shared/dates.ts';
import { MEASUREMENT_LABELS, type MeasurementKey } from '../../shared/types.ts';
import type { YearReviewData } from '../features/types.ts';

/** Reveal children as they scroll into view. */
function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.18 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${shown ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** A number that counts up once, when it first appears. */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setV(value);
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - start) / 1100);
        setV(value * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [value]);
  return <span ref={ref}>{format(v)}</span>;
}

function Chapter({ n, title, children, tone }: { n: string; title: string; children: ReactNode; tone?: string }) {
  return (
    <section className="chapter" style={tone ? ({ '--tone': tone } as React.CSSProperties) : undefined}>
      <Reveal>
        <div className="chapter-label">
          <span className="chapter-n">{n}</span>
          {title}
        </div>
      </Reveal>
      {children}
    </section>
  );
}

export default function YearInReview() {
  const { year: yp } = useParams();
  const boot = useBoot();
  const navigate = useNavigate();
  const year = Number(yp) || Number(boot.today.slice(0, 4));
  const q = useQuery({ queryKey: ['wrapped', year], queryFn: () => api.get<YearReviewData>(`/reviews/year/${year}`) });
  const travel = useTravel();
  useDocumentTitle(`${year} in review`);
  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const r = q.data;
  const t = r.totals;
  const inProgress = r.range.end >= boot.today;
  const empty = !t.minutes && !t.earnedCents && !t.workouts && !t.rated;
  const prGroups = groupPRs(r.prs);
  const measures = r.bodyChanges.filter((c) => c.field !== 'weightKg' && c.field !== 'bodyFatPct' && c.change != null && Math.abs(c.change) >= 0.2);
  const milestones = r.accomplishments.filter((a) => a.isMilestone);
  const wins = r.accomplishments.filter((a) => !a.isMilestone);
  const photoPair = r.firstPhotos && r.lastPhotos && r.firstPhotos.month !== r.lastPhotos.month;
  const yearPlaces = (travel.data?.places ?? []).filter((p) => p.status === 'home' || r.travel.some((v) => v.placeId === p.id));
  const tripCount = r.travelStats.trips;
  const screenFirst = r.screenMonths[0];
  const screenLast = r.screenMonths[r.screenMonths.length - 1];

  return (
    <div className="wrapped">
      <div className="wrapped-nav">
        <Link to="/reviews" className="back-link" style={{ margin: 0 }}>
          <ChevronLeft /> Reviews
        </Link>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate(`/wrapped/${year - 1}`)} aria-label="Previous year">
            <ChevronLeft />
          </button>
          <span className="num" style={{ fontWeight: 600 }}>{year}</span>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate(`/wrapped/${year + 1}`)} disabled={year >= Number(boot.today.slice(0, 4))} aria-label="Next year">
            <ChevronRight />
          </button>
        </div>
      </div>

      <header className="wrapped-hero">
        <Reveal>
          <div className="eyebrow">{boot.settings.name ? `${boot.settings.name}’s year` : 'Your year'}{inProgress ? ' · so far' : ''}</div>
        </Reveal>
        <Reveal delay={120}>
          <h1 className="wrapped-year">{year}</h1>
        </Reveal>
        <Reveal delay={260}>
          <p className="wrapped-lede">
            {empty
              ? 'Nothing was logged this year. Start today, and this page fills itself in.'
              : `${num(t.rated)} days rated. ${num(Math.round(t.minutes / 60))} hours of work. ${plural(t.workouts, 'workout')}. Here’s how it went.`}
          </p>
        </Reveal>
        {!empty && (
          <div className="scroll-cue" aria-hidden>
            <ChevronDown />
          </div>
        )}
      </header>

      {!empty && (
        <>
          <Chapter n="01" title="Every day of the year">
            <Reveal>
              <div className="wrapped-grid">
                <YearGrid year={year} days={r.grid.days} today={boot.today} />
              </div>
            </Reveal>
            <div className="wrapped-trio">
              <Reveal delay={0}>
                <div className="big-stat">
                  <div className="bs-n" style={{ color: 'var(--good)' }}><CountUp value={t.good} format={(n) => num(Math.round(n))} /></div>
                  <div className="bs-l">Good days · {pct(r.ratings.pctGood)}</div>
                </div>
              </Reveal>
              <Reveal delay={120}>
                <div className="big-stat">
                  <div className="bs-n" style={{ color: 'var(--okay)' }}><CountUp value={t.okay} format={(n) => num(Math.round(n))} /></div>
                  <div className="bs-l">Okay days · {pct(r.ratings.pctOkay)}</div>
                </div>
              </Reveal>
              <Reveal delay={240}>
                <div className="big-stat">
                  <div className="bs-n" style={{ color: 'var(--bad)' }}><CountUp value={t.bad} format={(n) => num(Math.round(n))} /></div>
                  <div className="bs-l">Bad days · {pct(r.ratings.pctBad)}</div>
                </div>
              </Reveal>
            </div>
            {r.longestStreak.length > 1 && (
              <Reveal>
                <p className="wrapped-line">
                  Your longest run of Good days was <b>{r.longestStreak.length} days</b>, from {shortDate(r.longestStreak.start!)} to {shortDate(r.longestStreak.end!)}.
                  {r.ratings.bestMonth && <> {monthName(r.ratings.bestMonth.month)} had the most Good days: <b>{r.ratings.bestMonth.good}</b>.</>}
                </p>
              </Reveal>
            )}
          </Chapter>

          {t.minutes > 0 && (
            <Chapter n="02" title="Work" tone="var(--work)">
              <Reveal>
                <div className="hero-number"><CountUp value={t.minutes / 60} format={(n) => num(Math.round(n))} /> <span>hours</span></div>
              </Reveal>
              <Reveal delay={100}>
                <p className="wrapped-line">
                  across <b>{t.workDays} days</b> and <b>{num(t.sessions)} sessions</b>
                  {r.longestDay && <> — the longest was {longDate(r.longestDay.date)}, at <b>{duration(r.longestDay.minutes)}</b></>}.
                </p>
              </Reveal>
              <Reveal delay={160}>
                <div className="wrapped-chart">
                  <BarChart ariaLabel="Hours per month" data={r.months.map((m) => ({ key: m.month, label: monthName(m.month, true), value: m.minutes }))} format={(v) => duration(v)} axisFormat={(v) => `${+(v / 60).toFixed(1)}h`} tickUnit={60}
            minMax={60} color="var(--work)" height={200} />
                </div>
              </Reveal>
              {r.projects.length > 0 && (
                <Reveal>
                  <div className="wrapped-list">
                    <div className="eyebrow">Where the hours went</div>
                    {r.projects.slice(0, 5).map((p, i) => (
                      <div key={p.id} className="wl-row">
                        <span className="wl-rank">{i + 1}</span>
                        <span className="avatar-dot" style={{ background: p.color ?? 'var(--text-4)' }} />
                        <span className="grow">{p.name}</span>
                        <span className="faint num">{duration(p.minutes)}</span>
                      </div>
                    ))}
                    {r.completedProjects.length > 0 && <p className="wrapped-line small">You completed <b>{plural(r.completedProjects.length, 'project')}</b>: {r.completedProjects.map((p) => p.name).join(', ')}.</p>}
                  </div>
                </Reveal>
              )}
            </Chapter>
          )}

          {t.earnedCents > 0 && (
            <Chapter n="03" title="Money" tone="var(--money)">
              <Reveal>
                <div className="hero-number"><CountUp value={t.earnedCents} format={(n) => money(Math.round(n / 100) * 100)} /></div>
              </Reveal>
              <Reveal delay={100}>
                <p className="wrapped-line">earned{r.avgRate ? <>, about <b>{money(r.avgRate)}</b> for every hour worked</> : null}.</p>
              </Reveal>
              <div className="wrapped-trio">
                {r.bestMonth && (
                  <Reveal>
                    <div className="big-stat small">
                      <div className="bs-l">Best month</div>
                      <div className="bs-n">{monthName(r.bestMonth.month)}</div>
                      <div className="bs-l">{money(r.bestMonth.cents)}</div>
                    </div>
                  </Reveal>
                )}
                {r.bestWeek && (
                  <Reveal delay={120}>
                    <div className="big-stat small">
                      <div className="bs-l">Best week</div>
                      <div className="bs-n">{dateRange(r.bestWeek.start, addDays(r.bestWeek.start, 6))}</div>
                      <div className="bs-l">{money(r.bestWeek.cents)}</div>
                    </div>
                  </Reveal>
                )}
                {r.bestDay && (
                  <Reveal delay={240}>
                    <div className="big-stat small">
                      <div className="bs-l">Best day</div>
                      <div className="bs-n">{shortDate(r.bestDay.date)}</div>
                      <div className="bs-l">{money(r.bestDay.cents)}</div>
                    </div>
                  </Reveal>
                )}
              </div>
              <Reveal>
                <div className="wrapped-chart">
                  <BarChart ariaLabel="Earnings per month" data={r.months.map((m) => ({ key: m.month, label: monthName(m.month, true), value: m.cents }))} format={(v) => money(v)} axisFormat={(v) => money(v, { compact: true })} color="var(--money)" height={200} highlight={r.bestMonth?.month} />
                </div>
              </Reveal>
            </Chapter>
          )}

          {t.workouts > 0 && (
            <Chapter n="04" title="Training" tone="var(--fitness)">
              <Reveal>
                <div className="hero-number"><CountUp value={t.workouts} format={(n) => num(Math.round(n))} /> <span>workouts</span></div>
              </Reveal>
              <Reveal delay={100}>
                <p className="wrapped-line">
                  <b>{duration(t.gymMinutes)}</b> in the gym and <b>{plural(prGroups.length, 'personal record')}</b>.
                  {r.mostTrained && <> Your most trained lift was <b>{r.mostTrained.name}</b> — {plural(r.mostTrained.sessions, 'session')}, {num(r.mostTrained.sets)} sets.</>}
                </p>
              </Reveal>
              {r.strength.length > 0 && (
                <Reveal>
                  <div className="strength-cards">
                    {r.strength.slice(0, 4).map((s) => (
                      <Link to={`/gym/exercises/${s.id}`} key={s.id} className="strength-card">
                        <div className="sc-name">{s.name}</div>
                        <div className="sc-nums num">
                          {weight(s.startE1rm, { unit: false })} <span className="faint">→</span> {weight(s.endE1rm)}
                        </div>
                        <div className="sc-pct pos num">+{pct(s.pct)}</div>
                      </Link>
                    ))}
                  </div>
                  <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Estimated one-rep max, first weeks of the year → best since.</div>
                </Reveal>
              )}
              {prGroups.length > 0 && (
                <Reveal>
                  <div className="wrapped-list">
                    <div className="eyebrow">Biggest lifts of the year</div>
                    {prGroups
                      .filter((g) => g.lead.type === 'weight')
                      .sort((a, b) => (b.lead.weightKg ?? 0) - (a.lead.weightKg ?? 0))
                      .filter((g, i, arr) => arr.findIndex((x) => x.lead.exerciseId === g.lead.exerciseId) === i)
                      .slice(0, 5)
                      .map((g) => (
                        <div key={g.key} className="wl-row">
                          <Trophy size={14} style={{ color: 'var(--fitness)' }} />
                          <span className="grow">{g.lead.exerciseName}</span>
                          <span className="num" style={{ fontWeight: 600 }}>{prText(g.lead).value}</span>
                          <span className="faint num">{shortDate(g.lead.date)}</span>
                        </div>
                      ))}
                  </div>
                </Reveal>
              )}
            </Chapter>
          )}

          {(r.weight?.from || measures.length > 0 || photoPair) && (
            <Chapter n="05" title="Body" tone="var(--body)">
              {r.weight?.from && r.weight.to && (
                <Reveal>
                  <div className="hero-number">
                    {weight(r.weight.from.value, { unit: false })} <span className="arrow">→</span> {weight(r.weight.to.value)}
                  </div>
                  <p className="wrapped-line">
                    {r.weight.change != null ? <><b>{weight(r.weight.change, { signed: true })}</b> from {shortDate(r.weight.from.date)} to {shortDate(r.weight.to.date)}.</> : null}
                  </p>
                </Reveal>
              )}
              {measures.length > 0 && (
                <Reveal>
                  <div className="measure-chips">
                    {measures.map((c) => (
                      <div key={c.field} className="measure-chip">
                        <span className="faint">{MEASUREMENT_LABELS[c.field as MeasurementKey]}</span>
                        <b className="num">{length(c.change, { signed: true })}</b>
                      </div>
                    ))}
                  </div>
                </Reveal>
              )}
              {photoPair && (
                <Reveal>
                  <div className="wrapped-photos">
                    {(['front', 'side', 'back'] as const).map((a) => {
                      const x = r.firstPhotos!.photos.find((p) => p.angle === a);
                      const y = r.lastPhotos!.photos.find((p) => p.angle === a);
                      if (!x || !y) return null;
                      return (
                        <div key={a} className="wp-pair">
                          <figure>
                            <img src={x.url} alt={`${a}, ${monthName(r.firstPhotos!.month)}`} loading="lazy" />
                            <figcaption>{monthName(r.firstPhotos!.month, true)}</figcaption>
                          </figure>
                          <figure>
                            <img src={y.url} alt={`${a}, ${monthName(r.lastPhotos!.month)}`} loading="lazy" />
                            <figcaption>{monthName(r.lastPhotos!.month, true)}</figcaption>
                          </figure>
                        </div>
                      );
                    })}
                  </div>
                  <Link to={`/photos/compare?from=${r.firstPhotos!.month}&to=${r.lastPhotos!.month}`} className="dash-more" style={{ display: 'inline-flex', marginTop: 10 }}>
                    Compare in detail
                  </Link>
                </Reveal>
              )}
            </Chapter>
          )}

          {r.travel.length > 0 && (
            <Chapter n="06" title="Places" tone="var(--travel)">
              <Reveal>
                <div className="hero-number"><CountUp value={r.travelStats.tripDays} format={(n) => num(Math.round(n))} /> <span>days away</span></div>
              </Reveal>
              <Reveal delay={100}>
                <p className="wrapped-line">
                  on <b>{plural(tripCount, 'trip')}</b> to <b>{plural(r.travelStats.places, 'place')}</b>
                  {r.travelStats.countries > 1 && <> in <b>{r.travelStats.countries} countries</b></>}
                  {r.travelStats.newPlaces.length > 0 && <> — <b>{r.travelStats.newPlaces.length} of them</b> for the first time</>}.
                </p>
              </Reveal>
              {yearPlaces.length > 0 && (
                <Reveal delay={160}>
                  <div className="wrapped-map">
                    <TravelMap places={yearPlaces} view={yearPlaces.every((p) => p.countryCode === 'US') ? 'us' : 'world'} still height={320} />
                  </div>
                </Reveal>
              )}
              <Reveal>
                <div className="wrapped-list">
                  {r.travel.map((v) => (
                    <Link key={v.id} to={`/travel?place=${v.placeId}`} className="wl-row">
                      <span className="faint num wl-date">{dateRange(v.startDate, v.endDate).replace(/, \d{4}$/, '')}</span>
                      <span className="grow">{v.title && v.title !== v.placeName ? v.title : v.placeName}</span>
                      <span className="faint">{v.title && v.title !== v.placeName ? v.placeName : v.country}</span>
                    </Link>
                  ))}
                </div>
              </Reveal>
            </Chapter>
          )}

          {r.screen.avg != null && r.screen.logged >= 7 && (
            <Chapter n="07" title="Screen time" tone="var(--screen)">
              <Reveal>
                <div className="hero-number"><CountUp value={r.screen.avg / 60} format={(n) => n.toFixed(1)} /> <span>hours a day</span></div>
              </Reveal>
              <Reveal delay={100}>
                <p className="wrapped-line">
                  on average, across <b>{plural(r.screen.logged, 'logged day')}</b>
                  {screenFirst && screenLast && screenFirst.month !== screenLast.month && (
                    <>
                      {' '}— from <b>{duration(screenFirst.avg)}</b> a day in {monthName(screenFirst.month)} to <b>{duration(screenLast.avg)}</b> in {monthName(screenLast.month)}
                    </>
                  )}
                  .
                </p>
              </Reveal>
              {r.screenMonths.length > 1 && (
                <Reveal delay={160}>
                  <div className="wrapped-chart">
                    <BarChart ariaLabel="Average daily screen time per month" data={r.screenMonths.map((m) => ({ key: m.month, label: monthName(m.month, true), value: m.avg }))} format={(v) => `${duration(v)} a day`} axisFormat={(v) => `${+(v / 60).toFixed(1)}h`} tickUnit={60} minMax={60} color="var(--screen)" height={200} />
                  </div>
                </Reveal>
              )}
            </Chapter>
          )}

          {(r.goalsCompleted.length > 0 || milestones.length > 0 || wins.length > 0 || r.visionAchieved.length > 0) && (
            <Chapter n="08" title="Milestones">
              {r.goalsCompleted.length > 0 && (
                <Reveal>
                  <div className="hero-number"><CountUp value={r.goalsCompleted.length} format={(n) => num(Math.round(n))} /> <span>goals completed</span></div>
                </Reveal>
              )}
              {milestones.length > 0 && (
                <Reveal>
                  <div className="milestone-timeline">
                    {milestones.map((m) => (
                      <Link key={m.id} to={`/day/${m.date}`} className="mt-item">
                        <span className="mt-date">{shortDate(m.date)}</span>
                        <span className="mt-dot"><Star size={12} /></span>
                        <span className="mt-text">{m.text}</span>
                      </Link>
                    ))}
                  </div>
                </Reveal>
              )}
              {r.visionAchieved.length > 0 && (
                <Reveal>
                  <div className="wrapped-list">
                    <div className="eyebrow">Off the vision board</div>
                    {r.visionAchieved.map((v) => (
                      <Link key={v.id} to={`/vision#card-${v.id}`} className="wl-row">
                        <span className="wl-rank"><Sparkles size={13} /></span>
                        <span className="grow">{v.title ?? v.body}</span>
                        <span className="faint">{shortDate(v.achievedOn)}</span>
                      </Link>
                    ))}
                  </div>
                </Reveal>
              )}
              {wins.length > 0 && (
                <Reveal>
                  <p className="wrapped-line small">
                    Plus <b>{plural(wins.length, 'smaller win')}</b> along the way — like “{wins[wins.length - 1].text}” on {dayDate(wins[wins.length - 1].date)}.
                  </p>
                </Reveal>
              )}
            </Chapter>
          )}

          <Chapter n="09" title="Looking back">
            <Reveal>
              <div className="wrapped-closing">
                <RatingBar good={t.good} okay={t.okay} bad={t.bad} height={14} />
                <p className="wrapped-line">
                  {r.ratings.pctGood != null && r.ratings.pctGood >= 0.5
                    ? `More than half of your rated days were good ones.`
                    : r.ratings.pctGood != null
                      ? `Not every day was a good one — and that’s the honest record.`
                      : ''}{' '}
                  Write a few lines for future you.
                </p>
              </div>
            </Reveal>
            <Reveal>
              <Reflection kind="year" start={r.range.start} answers={r.answers} />
            </Reveal>
            <Reveal>
              <div className="wrapped-end serif">{inProgress ? `The rest of ${year} is still unwritten.` : `Here’s to ${year + 1}.`}</div>
            </Reveal>
          </Chapter>
        </>
      )}
    </div>
  );
}
