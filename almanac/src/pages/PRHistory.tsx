import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useDocumentTitle } from '../lib/hooks.ts';
import { monthYear } from '../lib/format.ts';
import { Card, Empty, ErrorBox, PageHead, PageSkeleton } from '../components/ui/primitives.tsx';
import { Segmented } from '../components/ui/Segmented.tsx';
import { groupPRs, PRLine } from '../features/shared.tsx';
import type { PR } from '../../shared/types.ts';

export default function PRHistory() {
  useDocumentTitle('Personal records');
  const q = useQuery({ queryKey: ['prs'], queryFn: () => api.get<PR[]>('/prs') });
  const [type, setType] = useState<'all' | 'weight' | 'e1rm' | 'reps'>('all');
  const [ex, setEx] = useState('');
  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const exercises = [...new Set(q.data.map((p) => p.exerciseName))].sort();
  const filtered = q.data.filter((p) => (type === 'all' || p.type === type) && (!ex || p.exerciseName === ex));
  const groups = groupPRs(filtered);
  const byMonth = new Map<string, typeof groups>();
  for (const g of groups) {
    const m = g.lead.date.slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) ?? []), g]);
  }
  return (
    <div className="page">
      <PageHead back={{ to: '/gym', label: 'Gym' }} title="Personal records" sub="Detected automatically from every set you log." />
      <div className="filters">
        <Segmented
          size="sm"
          value={type}
          onChange={setType}
          options={[
            { value: 'all', label: 'All' },
            { value: 'weight', label: 'Weight' },
            { value: 'e1rm', label: 'Est. 1RM' },
            { value: 'reps', label: 'Reps' },
          ]}
        />
        <select className="select input-sm" value={ex} onChange={(e) => setEx(e.target.value)} aria-label="Exercise">
          <option value="">All exercises</option>
          {exercises.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
      </div>
      {!groups.length ? (
        <Card>
          <Empty icon={<Trophy />} title="No records yet">The first time you log an exercise sets the baseline. Beat it, and it shows up here.</Empty>
        </Card>
      ) : (
        <div className="stack-16">
          {[...byMonth.entries()].map(([m, gs]) => (
            <Card key={m} title={monthYear(m)} sub={`${gs.length}`}>
              {gs.map((g) => (
                <PRLine key={g.key} lead={g.lead} others={type === 'all' ? g.others : []} />
              ))}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
