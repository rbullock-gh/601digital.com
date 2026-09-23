import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useDocumentTitle } from '../lib/hooks.ts';
import { dateRange } from '../lib/format.ts';
import { Card, ErrorBox, PageSkeleton } from '../components/ui/primitives.tsx';
import { DayList, Reflection, ReportDetails, ReportStats } from '../features/ReviewParts.tsx';
import { addDays, isISODate } from '../../shared/dates.ts';
import type { PeriodReport } from '../features/types.ts';

export default function WeeklyReview() {
  const { date = '' } = useParams();
  const boot = useBoot();
  const d = isISODate(date) ? date : boot.today;
  const q = useQuery({ queryKey: ['review-week', d], queryFn: () => api.get<PeriodReport>(`/reviews/week/${d}`) });
  useDocumentTitle('Weekly review');
  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const r = q.data;
  const current = r.range.end >= boot.today;
  return (
    <div className="page">
      <Link to="/reviews" className="back-link"><ChevronLeft /> Reviews</Link>
      <header className="page-head">
        <div className="grow">
          <div className="eyebrow">{current ? 'This week · in progress' : 'Weekly review'}</div>
          <h1 className="serif review-title">{dateRange(r.range.start, r.range.end)}</h1>
        </div>
        <div className="actions">
          <Link to={`/reviews/week/${addDays(r.range.start, -7)}`} className="btn btn-secondary btn-icon" aria-label="Previous week"><ChevronLeft /></Link>
          <Link to={`/reviews/week/${addDays(r.range.start, 7)}`} className={`btn btn-secondary btn-icon ${current ? 'disabled-link' : ''}`} aria-label="Next week"><ChevronRight /></Link>
        </div>
      </header>
      <ReportStats r={r} compareLabel="vs prior week" />
      <div className="grid grid-12" style={{ marginTop: 16 }}>
        <Card className="span-5" title="Day by day"><DayList r={r} /></Card>
        <div className="span-7"><Reflection kind="week" start={r.range.start} answers={r.answers} /></div>
      </div>
      <ReportDetails r={r} />
    </div>
  );
}
