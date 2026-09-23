import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Camera, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useDocumentTitle } from '../lib/hooks.ts';
import { dayDate, duration, money, monthName, monthYear } from '../lib/format.ts';
import { Card, ErrorBox, PageSkeleton } from '../components/ui/primitives.tsx';
import { BarChart } from '../components/charts/charts.tsx';
import { Reflection, ReportDetails, ReportStats } from '../features/ReviewParts.tsx';
import { addMonthsYM, isYearMonth, weekday } from '../../shared/dates.ts';
import type { MonthlyReviewData } from '../features/types.ts';

export default function MonthlyReview() {
  const { month = '' } = useParams();
  if (!isYearMonth(month)) return <Navigate to="/reviews" replace />;
  return <Month key={month} month={month} />;
}

function Month({ month }: { month: string }) {
  const boot = useBoot();
  const q = useQuery({ queryKey: ['review-month', month], queryFn: () => api.get<MonthlyReviewData>(`/reviews/month/${month}`) });
  useDocumentTitle(`${monthYear(month)} review`);
  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const r = q.data;
  const current = month === boot.today.slice(0, 7);
  const ws = boot.settings.weekStart;
  const pad = (weekday(`${month}-01`) - ws + 7) % 7;

  return (
    <div className="page">
      <Link to="/reviews" className="back-link"><ChevronLeft /> Reviews</Link>
      <header className="page-head">
        <div className="grow">
          <div className="eyebrow">{current ? 'This month · in progress' : 'Monthly review'}</div>
          <h1 className="serif review-title">{monthYear(month)}</h1>
        </div>
        <div className="actions">
          <Link to={`/reviews/month/${addMonthsYM(month, -1)}`} className="btn btn-secondary btn-icon" aria-label="Previous month"><ChevronLeft /></Link>
          <Link to={`/reviews/month/${addMonthsYM(month, 1)}`} className={`btn btn-secondary btn-icon ${current ? 'disabled-link' : ''}`} aria-label="Next month"><ChevronRight /></Link>
        </div>
      </header>

      <ReportStats r={r} compareLabel="vs prior month" />

      <div className="grid grid-12" style={{ marginTop: 16 }}>
        <Card className="span-4" title="The month in days">
          <div className="mini-cal">
            {Array.from({ length: pad }, (_, i) => <span key={`p${i}`} />)}
            {r.days.map((d) => (
              <Link key={d.date} to={`/day/${d.date}`} className={`mc-day ${d.date > boot.today ? 'future' : d.rating ? `r${d.rating}` : ''}`} title={dayDate(d.date)}>
                {Number(d.date.slice(8))}
              </Link>
            ))}
          </div>
        </Card>
        <Card className="span-8" title="Earned per day" sub={money(r.totals.earnedCents)}>
          <BarChart
            ariaLabel="Earned per day"
            height={190}
            data={r.days.map((d) => ({ key: d.date, label: String(Number(d.date.slice(8))), value: d.cents }))}
            format={(v) => money(v)}
            axisFormat={(v) => money(v, { compact: true })}
            color="var(--money)"
            tooltip={(x) => {
              const d = r.days.find((y) => y.date === x.key)!;
              return (
                <>
                  <div className="tip-title">{dayDate(x.key)}</div>
                  <div className="tip-row">Earned <b>{money(d.cents)}</b></div>
                  <div className="tip-row">Worked <b>{duration(d.minutes)}</b></div>
                </>
              );
            }}
          />
        </Card>
      </div>

      <Card className="mt-16" title="Progress photos" actions={<Link to={`/photos/${month}`} className="dash-more">Open</Link>}>
        {r.photos?.photos.length ? (
          <div className="review-photos">
            <div>
              <div className="eyebrow row" style={{ gap: 6 }}>{r.photos.complete && <Check size={13} className="pos" />}{monthName(month)}</div>
              <div className="photo-thumbs">
                {r.photos.photos.filter((p) => p.angle !== 'other').map((p) => (
                  <Link key={p.id} to={`/photos/${month}`} className="photo-thumb"><img src={p.thumbUrl} alt={`${p.angle}`} loading="lazy" /></Link>
                ))}
              </div>
            </div>
            {r.previousPhotos?.photos.length ? (
              <div>
                <div className="eyebrow">{monthName(addMonthsYM(month, -1))}</div>
                <div className="photo-thumbs">
                  {r.previousPhotos.photos.filter((p) => p.angle !== 'other').map((p) => (
                    <Link key={p.id} to={`/photos/${addMonthsYM(month, -1)}`} className="photo-thumb"><img src={p.thumbUrl} alt={`${p.angle}`} loading="lazy" /></Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <Link to={`/photos/${month}?add=1`} className="photo-status" style={{ marginTop: 0 }}>
            <Camera size={15} /> No progress photos for {monthName(month)}{month <= boot.today.slice(0, 7) ? ' — add them' : ''}
          </Link>
        )}
      </Card>

      <ReportDetails r={r} />
      <div style={{ marginTop: 16 }}>
        <Reflection kind="month" start={r.range.start} answers={r.answers} />
      </div>
    </div>
  );
}
