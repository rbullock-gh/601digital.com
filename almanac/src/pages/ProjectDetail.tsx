import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { api, refreshAll } from '../lib/api.ts';
import { useUI } from '../lib/ui.tsx';
import { useDocumentTitle } from '../lib/hooks.ts';
import { clock, duration, hours, money, monthName, monthYear, shortDate } from '../lib/format.ts';
import { Card, ErrorBox, PageHead, PageSkeleton, Stat } from '../components/ui/primitives.tsx';
import { Dialog } from '../components/ui/Dialog.tsx';
import { BarChart, RankList } from '../components/charts/charts.tsx';
import { IncomeForm, ProjectForm, WorkSessionForm } from '../features/forms.tsx';
import { StatusBadge } from './Projects.tsx';
import type { Income, Project, ProjectSummary, WorkSession } from '../../shared/types.ts';

interface Detail {
  project: ProjectSummary;
  sessions: WorkSession[];
  income: Income[];
  monthly: { month: string; minutes: number; cents: number }[];
  categories: { name: string; minutes: number }[];
}

export default function ProjectDetail() {
  const { id } = useParams();
  const ui = useUI();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['project', id], queryFn: () => api.get<Detail>(`/projects/${id}`) });
  const [edit, setEdit] = useState(false);
  const [session, setSession] = useState<WorkSession | null>(null);
  const [income, setIncome] = useState<Income | null>(null);
  useDocumentTitle(q.data?.project.name ?? 'Project');
  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const { project: p, sessions, monthly, categories } = q.data;

  const setStatus = async (status: Project['status']) => {
    await api.put(`/projects/${p.id}`, { status });
    await refreshAll();
    ui.toast(`Marked ${status}`);
  };
  const remove = async () => {
    const ok = await ui.confirm({
      title: `Delete “${p.name}”?`,
      body: 'Its sessions and income stay in your history — they just won’t be linked to a project any more. Consider archiving instead.',
      confirm: 'Delete project',
      danger: true,
    });
    if (!ok) return;
    await api.del(`/projects/${p.id}`);
    await refreshAll();
    navigate('/projects');
  };

  return (
    <div className="page">
      <PageHead
        back={{ to: '/projects', label: 'Projects' }}
        title={
          <span className="row" style={{ gap: 12 }}>
            <span className="avatar-dot" style={{ background: p.color ?? 'var(--text-4)', width: 14, height: 14, borderRadius: 4 }} />
            {p.name}
          </span>
        }
        sub={[p.client, p.firstActivity && `${shortDate(p.firstActivity, true)} – ${p.lastActivity ? shortDate(p.lastActivity, true) : ''}`].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
            <select className="select input-sm" value={p.status} onChange={(e) => setStatus(e.target.value as Project['status'])} aria-label="Status">
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
            <button className="btn btn-secondary" onClick={() => setEdit(true)}>
              <Pencil /> Edit
            </button>
            <button className="btn btn-ghost btn-icon" onClick={remove} aria-label="Delete project">
              <Trash2 />
            </button>
          </>
        }
      />
      <div className="card">
        <div className="stat-row" style={{ '--cols': 5 } as React.CSSProperties}>
          <Stat label="Status" value={<StatusBadge status={p.status} />} foot={p.completedOn ? `Completed ${shortDate(p.completedOn)}` : undefined} />
          <Stat label="Hours" value={`${hours(p.minutes)}h`} foot={`${p.sessions} sessions`} />
          <Stat label="Earned" value={money(p.earnedCents)} />
          <Stat label="Effective rate" value={p.minutes ? `${money(Math.round((p.earnedCents * 60) / p.minutes))}/h` : '—'} foot={p.hourlyRateCents ? `Billed at ${money(p.hourlyRateCents)}/h` : 'Default rate'} />
          <Stat label="Latest activity" value={p.lastActivity ? shortDate(p.lastActivity) : '—'} foot={p.firstActivity ? `First ${shortDate(p.firstActivity, true)}` : undefined} />
        </div>
      </div>

      <div className="grid grid-12" style={{ marginTop: 16 }}>
        <Card className="span-8" title="Hours by month">
          {monthly.length ? (
            <BarChart
              ariaLabel="Project hours by month"
              data={monthly.map((m) => ({ key: m.month, label: monthName(m.month, true), value: m.minutes }))}
              format={(v) => duration(v)}
              axisFormat={(v) => `${+(v / 60).toFixed(1)}h`}
            tickUnit={60}
            minMax={60}
              color={p.color ?? 'var(--work)'}
              tooltip={(d) => {
                const m = monthly.find((x) => x.month === d.key)!;
                return (
                  <>
                    <div className="tip-title">{monthYear(d.key)}</div>
                    <div className="tip-row">Hours <b>{duration(m.minutes)}</b></div>
                    <div className="tip-row">Earned <b>{money(m.cents)}</b></div>
                  </>
                );
              }}
            />
          ) : (
            <div className="faint">No activity yet.</div>
          )}
        </Card>
        <Card className="span-4" title="Type of work">
          <RankList items={categories.map((c) => ({ key: c.name, label: c.name, value: c.minutes }))} format={(v) => duration(v)} color={p.color ?? 'var(--work)'} empty={<div className="faint">—</div>} />
          {p.notes && (
            <>
              <div className="divider" />
              <div className="eyebrow">Notes</div>
              <p style={{ marginTop: 6, whiteSpace: 'pre-wrap', fontSize: 'var(--fs-13)' }} className="muted">
                {p.notes}
              </p>
            </>
          )}
        </Card>
      </div>

      {q.data.income.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Payments</h2>
          </div>
          <div className="card card-flush">
            {q.data.income.map((i) => (
              <button key={i.id} className="session-row" onClick={() => setIncome(i)}>
                <span className="sr-time num">{shortDate(i.date, true)}</span>
                <span className="sr-main">
                  <span className="title truncate">{i.source}</span>
                </span>
                <span />
                <span className="sr-money num">{money(i.amountCents)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Sessions</h2>
          <span className="sub">{sessions.length}</span>
        </div>
        <div className="card card-flush">
          {sessions.length === 0 && <div className="empty"><h3>No sessions yet</h3></div>}
          {sessions.map((s) => (
            <button key={s.id} className="session-row" onClick={() => setSession(s)}>
              <span className="sr-time num">
                <Link to={`/day/${s.date}`} onClick={(e) => e.stopPropagation()} className="link" style={{ color: 'inherit' }}>
                  {shortDate(s.date, true)}
                </Link>
                {s.startTime ? ` · ${clock(s.startTime)}` : ''}
              </span>
              <span className="sr-main">
                <span className="title truncate">{s.description || 'Work session'}</span>
                <span className="sr-meta">{s.categoryName}</span>
              </span>
              <span className="sr-dur num">{duration(s.minutes)}</span>
              <span className="sr-money num">{s.payType === 'unpaid' ? <span className="faint">Unpaid</span> : money(s.earnedCents)}</span>
            </button>
          ))}
        </div>
      </section>

      <Dialog open={edit} onClose={() => setEdit(false)} title="Edit project">
        <ProjectForm project={p} onDone={() => setEdit(false)} />
      </Dialog>
      <Dialog open={!!session} onClose={() => setSession(null)} title="Edit work session">
        {session && <WorkSessionForm session={session} onDone={() => setSession(null)} />}
      </Dialog>
      <Dialog open={!!income} onClose={() => setIncome(null)} title="Edit income">
        {income && <IncomeForm income={income} onDone={() => setIncome(null)} />}
      </Dialog>
    </div>
  );
}
