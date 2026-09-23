import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Briefcase, Camera, ChevronLeft, ChevronRight, DollarSign, Dumbbell, Plus, Scale, Star, StickyNote, Trash2, Trophy } from 'lucide-react';
import { api, refreshAll } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useUI } from '../lib/ui.tsx';
import { clock, duration, length, longDate, money, weight } from '../lib/format.ts';
import { Card, Empty, ErrorBox, PageSkeleton, RatingBadge } from '../components/ui/primitives.tsx';
import { Dialog } from '../components/ui/Dialog.tsx';
import { BodyForm, IncomeForm, WorkSessionForm } from './forms.tsx';
import { RateDay } from './RateDay.tsx';
import { GoalRow, groupPRs, PRLine } from './shared.tsx';
import { TimerCard } from '../components/Timer.tsx';
import { MEASUREMENTS, MEASUREMENT_LABELS, type BodyMetric, type DayView, type Income, type WorkSession } from '../../shared/types.ts';
import { addDays, type ISODate } from '../../shared/dates.ts';

type Editing = { kind: 'session'; s: WorkSession } | { kind: 'income'; i: Income } | { kind: 'body'; b: BodyMetric } | null;

export function DayDetail({ date, isToday }: { date: ISODate; isToday?: boolean }) {
  const boot = useBoot();
  const ui = useUI();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['day', date], queryFn: () => api.get<DayView>(`/days/${date}`) });
  const [editing, setEditing] = useState<Editing>(null);

  useEffect(() => {
    if (isToday) return;
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || document.querySelector('.dialog')) return;
      if (e.key === 'ArrowLeft') navigate(`/day/${addDays(date, -1)}`);
      if (e.key === 'ArrowRight' && addDays(date, 1) <= boot.today) navigate(`/day/${addDays(date, 1)}`);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [date, isToday, navigate, boot.today]);

  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const d = q.data;
  const future = date > boot.today;
  const preset = { date, direct: true };
  const gymMinutes = d.workouts.reduce((a, w) => a + (w.durationMinutes ?? 0), 0);

  return (
    <div className="page day-page">
      <header className="day-head">
        <div className="grow">
          <div className="eyebrow">{isToday ? 'Today' : date === addDays(boot.today, -1) ? 'Yesterday' : future ? 'Upcoming' : date.slice(0, 4)}</div>
          <h1 className="serif">{longDate(date)}</h1>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <RatingBadge rating={d.rating} />
            {d.minutes > 0 && <span className="badge">{duration(d.minutes)} worked</span>}
            {d.earnedCents > 0 && <span className="badge">{money(d.earnedCents)}</span>}
            {d.workouts.length > 0 && <span className="badge">{d.workouts[0].name}</span>}
            {d.prs.length > 0 && <span className="badge badge-pr"><Trophy /> {groupPRs(d.prs).length} PR{groupPRs(d.prs).length > 1 ? 's' : ''}</span>}
          </div>
        </div>
        <div className="row day-nav">
          <Link to={`/day/${d.prev}`} className="btn btn-secondary btn-icon" aria-label="Previous day" title="Previous day (←)">
            <ChevronLeft />
          </Link>
          {!isToday && (
            <Link to="/today" className="btn btn-secondary">
              Today
            </Link>
          )}
          <Link
            to={`/day/${d.next}`}
            className={`btn btn-secondary btn-icon ${d.next > boot.today ? 'disabled' : ''}`}
            aria-label="Next day"
            aria-disabled={d.next > boot.today}
            onClick={(e) => d.next > boot.today && e.preventDefault()}
            title="Next day (→)"
          >
            <ChevronRight />
          </Link>
        </div>
      </header>

      <div className="grid grid-12 day-grid">
        <div className="span-8 stack-16">
          {!future && (
            <Card>
              <RateDay date={date} rating={d.rating} journal={d.journal} title={isToday ? 'How was today?' : 'How was this day?'} />
            </Card>
          )}

          {isToday && (
            <div className="today-actions">
              <div className="ta-timer">
                <TimerCard />
              </div>
              <button className="ta-btn" onClick={() => ui.openAdd('work', preset)}>
                <Briefcase /> Log work
              </button>
              <button className="ta-btn" onClick={() => ui.openAdd('income', preset)}>
                <DollarSign /> Income
              </button>
              <Link className="ta-btn" to="/gym/new">
                <Dumbbell /> Workout
              </Link>
              <button className="ta-btn" onClick={() => ui.openAdd('weight', preset)}>
                <Scale /> Weight
              </button>
            </div>
          )}

          <Card
            title="Work"
            sub={d.minutes ? `${duration(d.minutes)} · ${money(d.earnedCents)}` : undefined}
            actions={
              <button className="btn btn-ghost btn-sm" onClick={() => ui.openAdd('work', preset)}>
                <Plus /> Session
              </button>
            }
          >
            {d.sessions.length || d.income.length ? (
              <div className="list">
                {d.sessions.map((s) => (
                  <button key={s.id} className="list-row interactive" onClick={() => setEditing({ kind: 'session', s })}>
                    <span className="avatar-dot" style={{ background: s.projectColor ?? 'var(--text-4)' }} />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <div className="title truncate">{s.description || s.projectName || 'Work session'}</div>
                      <div className="meta truncate">
                        {[s.startTime && `${clock(s.startTime)} – ${clock(s.endTime)}`, s.projectName, s.categoryName, s.breakMinutes ? `${s.breakMinutes}m break` : null].filter(Boolean).join(' · ')}
                      </div>
                    </span>
                    <span className="value">
                      <div>{duration(s.minutes)}</div>
                      <div className="meta">{s.payType === 'unpaid' ? 'Unpaid' : money(s.earnedCents)}</div>
                    </span>
                  </button>
                ))}
                {d.income.map((i) => (
                  <button key={`i${i.id}`} className="list-row interactive" onClick={() => setEditing({ kind: 'income', i })}>
                    <span className="avatar-dot" style={{ background: 'var(--money)' }} />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <div className="title truncate">{i.source}</div>
                      <div className="meta">{[i.kind === 'flat' ? 'Flat-rate job' : i.kind === 'project' ? 'Project income' : 'Other income', i.projectName].filter(Boolean).join(' · ')}</div>
                    </span>
                    <span className="value">{money(i.amountCents)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty small title={future ? 'Nothing yet' : 'No work logged'}>
                {isToday ? 'Start the timer or log a session.' : 'Log a session for this day if you worked.'}
              </Empty>
            )}
          </Card>

          <Card
            title="Training"
            sub={gymMinutes ? duration(gymMinutes) : undefined}
            actions={
              <Link to={`/gym/new?date=${date}`} className="btn btn-ghost btn-sm">
                <Plus /> Workout
              </Link>
            }
          >
            {d.workouts.length ? (
              <div className="stack-16">
                {d.workouts.map((w) => (
                  <Link key={w.id} to={`/gym/workouts/${w.id}`} className="workout-line">
                    <span className="icon-tile" style={{ '--c': 'var(--fitness)', '--c-soft': 'var(--fitness-soft)' } as React.CSSProperties}>
                      <Dumbbell />
                    </span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <div className="title">{w.name}</div>
                      <div className="meta truncate">{w.exercises.join(' · ')}</div>
                    </span>
                    <span className="value">
                      <div>{w.durationMinutes ? duration(w.durationMinutes) : ''}</div>
                      <div className="meta">{w.setCount} sets</div>
                    </span>
                  </Link>
                ))}
                {d.prs.length > 0 && (
                  <div>
                    {groupPRs(d.prs).map((g) => (
                      <PRLine key={g.key} lead={g.lead} others={g.others} showDate={false} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Empty small title="No workout">Rest days count too.</Empty>
            )}
          </Card>

          <Journal date={date} initial={d.journal} />
        </div>

        <div className="span-4 stack-16">
          {d.goals.length > 0 && (
            <Card title="Daily goals" sub={`${d.goals.filter((g) => g.done).length}/${d.goals.length}`}>
              <div className="stack-16">
                {d.goals.map((g) => (
                  <GoalRow key={g.id} g={g} compact />
                ))}
              </div>
            </Card>
          )}
          <Wins date={date} items={d.accomplishments} />
          <Notes date={date} items={d.notes} />
          <Card
            title="Body"
            actions={
              <button className="btn btn-ghost btn-sm" onClick={() => ui.openAdd('body', preset)}>
                <Plus /> Log
              </button>
            }
          >
            {d.body.length ? (
              d.body.map((b) => (
                <button key={b.id} className="body-mini" onClick={() => setEditing({ kind: 'body', b })}>
                  {b.weightKg != null && <div className="bm-weight">{weight(b.weightKg)}</div>}
                  <div className="bm-grid">
                    {MEASUREMENTS.filter((k) => b[k] != null).map((k) => (
                      <span key={k}>
                        <span className="faint">{MEASUREMENT_LABELS[k]}</span> {length(b[k])}
                      </span>
                    ))}
                  </div>
                </button>
              ))
            ) : (
              <div className="faint" style={{ fontSize: 13 }}>No measurements this day.</div>
            )}
          </Card>
          {d.photoSet && (
            <Card title="Progress photos" actions={<Link to={`/photos/${d.photoSet.month}`} className="btn btn-ghost btn-sm"><Camera /> Open</Link>}>
              <div className="photo-thumbs">
                {d.photoSet.photos.slice(0, 3).map((p) => (
                  <Link key={p.id} to={`/photos/${d.photoSet!.month}`} className="photo-thumb">
                    <img src={p.thumbUrl} alt={`${p.angle} progress photo`} loading="lazy" />
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.kind === 'session' ? 'Edit work session' : editing?.kind === 'income' ? 'Edit income' : 'Edit body entry'}>
        {editing?.kind === 'session' && <WorkSessionForm session={editing.s} onDone={() => setEditing(null)} />}
        {editing?.kind === 'income' && <IncomeForm income={editing.i} onDone={() => setEditing(null)} />}
        {editing?.kind === 'body' && <BodyForm entry={editing.b} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

/** The day's journal. Saves itself as you type. */
function Journal({ date, initial }: { date: ISODate; initial: string | null }) {
  const [text, setText] = useState(initial ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saved = useRef(initial ?? '');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    setText(initial ?? '');
    saved.current = initial ?? '';
  }, [date]);

  const save = async (v: string) => {
    if (v === saved.current) return;
    setStatus('saving');
    try {
      await api.put(`/days/${date}`, { journal: v });
      saved.current = v;
      setStatus('saved');
      refreshAll();
    } catch {
      setStatus('idle');
    }
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <Card title="Journal" actions={<span className="faint" style={{ fontSize: 12 }}>{status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}</span>}>
      <textarea
        className="textarea journal"
        value={text}
        placeholder="What happened today? What did you work on, how did you feel?"
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          setStatus('idle');
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => save(v), 900);
        }}
        onBlur={() => {
          window.clearTimeout(timer.current);
          save(text);
        }}
        aria-label="Journal entry"
      />
    </Card>
  );
}

function Wins({ date, items }: { date: ISODate; items: DayView['accomplishments'] }) {
  const ui = useUI();
  const [text, setText] = useState('');
  const add = async () => {
    if (!text.trim()) return;
    try {
      await api.post('/accomplishments', { date, text });
      setText('');
      await refreshAll();
    } catch (e) {
      ui.error(e);
    }
  };
  const toggleMilestone = async (id: number, v: boolean) => {
    await api.put(`/accomplishments/${id}`, { isMilestone: v });
    await refreshAll();
    if (v) ui.toast('Marked as a milestone');
  };
  const remove = async (id: number) => {
    await api.del(`/accomplishments/${id}`);
    ui.deleted('Win', 'accomplishments', id);
  };
  return (
    <Card title="Wins" sub={items.length ? String(items.length) : undefined}>
      <div className="mini-list">
        {items.map((a) => (
          <div key={a.id} className="mini-item">
            <button className={`star-btn ${a.isMilestone ? 'on' : ''}`} onClick={() => toggleMilestone(a.id, !a.isMilestone)} aria-label={a.isMilestone ? 'Unmark milestone' : 'Mark as milestone'} title="Milestone">
              <Star />
            </button>
            <span className="grow">{a.text}</span>
            <button className="btn btn-ghost btn-icon btn-sm hover-only" onClick={() => remove(a.id)} aria-label="Delete">
              <Trash2 />
            </button>
          </div>
        ))}
      </div>
      <form
        className="inline-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Trophy />
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a win…" aria-label="Add a win" />
      </form>
    </Card>
  );
}

function Notes({ date, items }: { date: ISODate; items: DayView['notes'] }) {
  const ui = useUI();
  const [text, setText] = useState('');
  const add = async () => {
    if (!text.trim()) return;
    try {
      await api.post('/notes', { date, body: text });
      setText('');
      await refreshAll();
    } catch (e) {
      ui.error(e);
    }
  };
  const remove = async (id: number) => {
    await api.del(`/notes/${id}`);
    ui.deleted('Note', 'notes', id);
  };
  return (
    <Card title="Notes" sub={items.length ? String(items.length) : undefined}>
      <div className="mini-list">
        {items.map((n) => (
          <div key={n.id} className="mini-item">
            <span className="faint num" style={{ fontSize: 12, minWidth: 54 }}>{n.time ? clock(n.time) : ''}</span>
            <span className="grow" style={{ whiteSpace: 'pre-wrap' }}>{n.body}</span>
            <button className="btn btn-ghost btn-icon btn-sm hover-only" onClick={() => remove(n.id)} aria-label="Delete note">
              <Trash2 />
            </button>
          </div>
        ))}
      </div>
      <form
        className="inline-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <StickyNote />
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Quick note…" aria-label="Add a note" />
      </form>
    </Card>
  );
}
