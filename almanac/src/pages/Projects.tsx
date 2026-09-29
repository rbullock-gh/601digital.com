import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FolderKanban, Plus } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useUI } from '../lib/ui.tsx';
import { useDocumentTitle } from '../lib/hooks.ts';
import { duration, money, shortDate } from '../lib/format.ts';
import { Empty, ErrorBox, PageHead, PageSkeleton } from '../components/ui/primitives.tsx';
import { Segmented } from '../components/ui/Segmented.tsx';
import type { ProjectSummary } from '../../shared/types.ts';

type Filter = 'active' | 'paused' | 'completed' | 'archived' | 'all';

export const STATUS_LABEL = { active: 'Active', paused: 'Paused', completed: 'Completed', archived: 'Archived' } as const;

export function StatusBadge({ status }: { status: ProjectSummary['status'] }) {
  return <span className={`badge status-${status}`}>{STATUS_LABEL[status]}</span>;
}

export default function Projects() {
  const ui = useUI();
  useDocumentTitle('Projects');
  const q = useQuery({ queryKey: ['projects'], queryFn: () => api.get<ProjectSummary[]>('/projects') });
  const [filter, setFilter] = useState<Filter>('active');
  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const count = (f: Filter) => (f === 'all' ? q.data.length : q.data.filter((p) => p.status === f).length);
  const list = q.data.filter((p) => filter === 'all' || p.status === filter);

  return (
    <div className="page">
      <PageHead
        title="Projects"
        sub="Hours, earnings and effective rate for everything you work on."
        actions={
          <button className="btn btn-primary" onClick={() => ui.openAdd('project', { direct: true })}>
            <Plus /> New project
          </button>
        }
      />
      <div style={{ marginBottom: 16 }}>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={(['active', 'paused', 'completed', 'archived', 'all'] as Filter[]).map((f) => ({
            value: f,
            label: (
              <>
                {f === 'all' ? 'All' : STATUS_LABEL[f]} <span className="faint num">{count(f)}</span>
              </>
            ),
          }))}
        />
      </div>
      {list.length === 0 ? (
        <div className="card">
          <Empty icon={<FolderKanban />} title={filter === 'active' ? 'No active projects' : 'Nothing here'} action={<button className="btn btn-secondary btn-sm" onClick={() => ui.openAdd('project', { direct: true })}>Create a project</button>}>
            Projects are created automatically when you type a new name while logging work — or add one here.
          </Empty>
        </div>
      ) : (
        <div className="project-grid">
          {list.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="project-card">
              <div className="row" style={{ gap: 10 }}>
                <span className="avatar-dot" style={{ background: p.color ?? 'var(--text-4)', width: 12, height: 12, borderRadius: 4 }} />
                <span className="pc-name truncate">{p.name}</span>
                <StatusBadge status={p.status} />
              </div>
              {p.client && <div className="pc-client">{p.client}</div>}
              <div className="pc-stats">
                <div>
                  <div className="eyebrow">Hours</div>
                  <div className="num">{duration(p.minutes)}</div>
                </div>
                <div>
                  <div className="eyebrow">Earned</div>
                  <div className="num">{money(p.earnedCents)}</div>
                </div>
                <div>
                  <div className="eyebrow">Per hour</div>
                  <div className="num">{p.minutes ? money(Math.round((p.earnedCents * 60) / p.minutes)) : '—'}</div>
                </div>
              </div>
              <div className="pc-foot">
                {p.firstActivity ? `${shortDate(p.firstActivity)} – ${p.lastActivity && p.lastActivity !== p.firstActivity ? shortDate(p.lastActivity) : 'now'}` : 'No activity yet'}
                {p.completedOn && ` · Completed ${shortDate(p.completedOn)}`}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
