import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, NotebookPen, Star } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useDocumentTitle } from '../lib/hooks.ts';
import { dateRange, hours, money, monthYear, pct } from '../lib/format.ts';
import { ErrorBox, PageHead, PageSkeleton } from '../components/ui/primitives.tsx';
import { Segmented } from '../components/ui/Segmented.tsx';
import { RatingBar } from '../components/charts/charts.tsx';
import { addDays } from '../../shared/dates.ts';
import type { MonthPoint } from '../features/types.ts';

interface Index {
  months: (MonthPoint & { written: boolean })[];
  weeks: { start: string; written: boolean }[];
  years: number[];
}

export default function Reviews() {
  const boot = useBoot();
  useDocumentTitle('Reviews');
  const [tab, setTab] = useState<'month' | 'week' | 'year'>('month');
  const q = useQuery({ queryKey: ['reviews'], queryFn: () => api.get<Index>('/reviews') });
  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const cur = boot.today.slice(0, 7);

  return (
    <div className="page">
      <PageHead title="Reviews" sub="The numbers are always computed from your records. Your reflections are saved alongside them." />
      <div style={{ marginBottom: 18 }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'month', label: 'Monthly' }, { value: 'week', label: 'Weekly' }, { value: 'year', label: 'Yearly' }]} />
      </div>
      {tab === 'month' && (
        <div className="review-list">
          {q.data.months.map((m) => {
            const rated = m.good + m.okay + m.bad;
            return (
              <Link key={m.month} to={`/reviews/month/${m.month}`} className="review-row">
                <div className="rr-title">
                  <span className="serif">{monthYear(m.month)}</span>
                  {m.month === cur && <span className="badge">In progress</span>}
                  {m.written && <span className="badge" title="Reflection written"><NotebookPen /> Written</span>}
                </div>
                <div className="rr-stats num">
                  <span><b>{money(m.cents)}</b> earned</span>
                  <span><b>{hours(m.minutes)}h</b> worked</span>
                  <span><b>{m.workouts}</b> workouts</span>
                  <span><b>{rated ? pct(m.good / rated) : '—'}</b> good days</span>
                </div>
                <div className="rr-bar"><RatingBar good={m.good} okay={m.okay} bad={m.bad} height={6} /></div>
                <ArrowRight size={16} className="faint rr-arrow" />
              </Link>
            );
          })}
        </div>
      )}
      {tab === 'week' && (
        <div className="review-list">
          {q.data.weeks.map((w, i) => (
            <Link key={w.start} to={`/reviews/week/${w.start}`} className="review-row">
              <div className="rr-title">
                <span className="serif">{dateRange(w.start, addDays(w.start, 6))}</span>
                {i === 0 && <span className="badge">This week</span>}
                {w.written && <span className="badge"><NotebookPen /> Written</span>}
              </div>
              <ArrowRight size={16} className="faint rr-arrow" />
            </Link>
          ))}
        </div>
      )}
      {tab === 'year' && (
        <div className="review-list">
          {q.data.years.map((y) => (
            <Link key={y} to={`/wrapped/${y}`} className="review-row">
              <div className="rr-title">
                <span className="serif">{y} in review</span>
                {String(y) === boot.today.slice(0, 4) && <span className="badge">So far</span>}
              </div>
              <span className="faint row" style={{ gap: 6, fontSize: 13 }}><Star size={14} /> The whole year, told as a story</span>
              <ArrowRight size={16} className="faint rr-arrow" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
