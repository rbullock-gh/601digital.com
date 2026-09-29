import { useQuery } from '@tanstack/react-query';
import { Briefcase, Dumbbell, Heart, Info, Link2, MapPin, Ruler, Smartphone, Wallet } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useDocumentTitle } from '../lib/hooks.ts';
import { Card, Empty, ErrorBox, PageHead, PageSkeleton } from '../components/ui/primitives.tsx';
import type { Insight } from '../../shared/types.ts';

const DOMAINS: { key: Insight['domain']; label: string; icon: React.ReactNode; c: string }[] = [
  { key: 'money', label: 'Money', icon: <Wallet />, c: 'var(--money)' },
  { key: 'work', label: 'Work', icon: <Briefcase />, c: 'var(--work)' },
  { key: 'fitness', label: 'Fitness', icon: <Dumbbell />, c: 'var(--fitness)' },
  { key: 'body', label: 'Body', icon: <Ruler />, c: 'var(--body)' },
  { key: 'life', label: 'Life', icon: <Heart />, c: 'var(--good)' },
  { key: 'screen', label: 'Screen time', icon: <Smartphone />, c: 'var(--screen)' },
  { key: 'travel', label: 'Travel', icon: <MapPin />, c: 'var(--travel)' },
];

export default function Insights() {
  useDocumentTitle('Insights');
  const q = useQuery({ queryKey: ['insights'], queryFn: () => api.get<Insight[]>('/insights') });
  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const links = q.data.filter((i) => i.domain === 'links');
  const top = q.data.filter((i) => i.domain !== 'links');

  return (
    <div className="page">
      <PageHead title="Insights" sub="Plain arithmetic on your own records. Each one appears only once there’s enough data to back it up." />
      {!q.data.length ? (
        <Card>
          <Empty icon={<Info />} title="Not enough history yet">Insights appear after a few weeks of logging — work, workouts, and daily ratings.</Empty>
        </Card>
      ) : (
        <>
          <div className="insight-grid">
            {DOMAINS.map((d) => {
              const list = top.filter((i) => i.domain === d.key);
              if (!list.length) return null;
              return (
                <Card key={d.key} title={<span className="row" style={{ gap: 8 }}><span className="icon-tile" style={{ '--c': d.c, '--c-soft': `color-mix(in srgb, ${d.c} 14%, transparent)`, width: 26, height: 26 } as React.CSSProperties}>{d.icon}</span>{d.label}</span>}>
                  <div className="insight-list">
                    {list.map((i) => (
                      <div key={i.id} className="insight">
                        <div className="insight-text">{i.text}</div>
                        {i.detail && <div className="insight-detail">{i.detail}</div>}
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>

          {links.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2 className="row" style={{ gap: 8 }}>
                  <Link2 size={18} /> How areas of your life move together
                </h2>
              </div>
              <div className="callout" style={{ marginBottom: 14 }}>
                <Info />
                <span>
                  These are <b>correlations, not causes</b>. A pattern here means two things tended to happen together in your data — not that one made the other happen.
                </span>
              </div>
              <div className="grid grid-2">
                {links.map((i) => (
                  <div key={i.id} className="card link-card">
                    <span className="corr-tag">Correlation</span>
                    <div className="insight-text" style={{ fontSize: 'var(--fs-17)' }}>{i.text}</div>
                    {i.detail && <div className="insight-detail">{i.detail}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
