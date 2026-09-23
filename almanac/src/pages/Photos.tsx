import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Check, Columns2, Plus } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useDocumentTitle } from '../lib/hooks.ts';
import { monthName, weight } from '../lib/format.ts';
import { Card, Empty, ErrorBox, PageHead, PageSkeleton } from '../components/ui/primitives.tsx';
import { eachMonth } from '../../shared/dates.ts';
import type { PhotoSet } from '../../shared/types.ts';

interface PhotosData {
  sets: PhotoSet[];
  current: { month: string; count: number; complete: boolean };
  photoDay: number;
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function Photos() {
  const boot = useBoot();
  const navigate = useNavigate();
  useDocumentTitle('Progress photos');
  const q = useQuery({ queryKey: ['photos'], queryFn: () => api.get<PhotosData>('/photos') });
  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const { sets, current, photoDay } = q.data;
  const cur = boot.today.slice(0, 7);
  const first = sets.length ? sets[sets.length - 1].month : cur;
  const months = eachMonth(first, cur).reverse();
  const byMonth = new Map(sets.map((s) => [s.month, s]));
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const done = sets.filter((s) => s.complete).length;

  return (
    <div className="page">
      <PageHead
        title="Progress photos"
        sub={`Private, unedited, stored only on your machine. Photo day: the ${ordinal(photoDay)} of each month.`}
        actions={
          <>
            {sets.length > 1 && (
              <Link to="/photos/compare" className="btn btn-secondary">
                <Columns2 /> Compare
              </Link>
            )}
            <button className="btn btn-primary" onClick={() => navigate(`/photos/${cur}?add=1`)}>
              <Plus /> Add photos
            </button>
          </>
        }
      />

      <div className={`photo-banner ${current.complete ? 'ok' : ''}`}>
        <span className="icon-tile" style={{ '--c': current.complete ? 'var(--good)' : 'var(--body)', '--c-soft': current.complete ? 'color-mix(in srgb, var(--good) 14%, transparent)' : 'var(--body-soft)' } as React.CSSProperties}>
          {current.complete ? <Check /> : <Camera />}
        </span>
        <div className="grow">
          <div className="reminder-title">{current.complete ? `${monthName(cur)} progress photos complete` : `${monthName(cur)} photos not added yet`}</div>
          <div className="reminder-sub">
            {current.complete ? 'Front, side and back are in. See you next month.' : current.count ? `${current.count} of 3 standard angles added.` : 'Front, side and back — about two minutes.'}
          </div>
        </div>
        {!current.complete && (
          <Link to={`/photos/${cur}?add=1`} className="btn btn-primary btn-sm">
            Add {monthName(cur)} photos
          </Link>
        )}
      </div>

      {!sets.length ? (
        <Card className="mt-16">
          <Empty icon={<Camera />} title="Your timeline starts with one set">
            Take front, side and back photos once a month. Months from now, the comparison will be worth it.
          </Empty>
        </Card>
      ) : (
        <>
          <div className="faint" style={{ fontSize: 12, margin: '20px 0 12px' }}>
            {done} complete month{done === 1 ? '' : 's'} · {months.length} month{months.length === 1 ? '' : 's'} on the timeline
          </div>
          {years.map((y) => (
            <section key={y} className="photo-year">
              <h2 className="serif photo-year-title">{y}</h2>
              <div className="photo-timeline">
                {months
                  .filter((m) => m.startsWith(y))
                  .map((m) => {
                    const s = byMonth.get(m);
                    const front = s?.photos.find((p) => p.angle === 'front') ?? s?.photos[0];
                    return (
                      <Link key={m} to={`/photos/${m}${s ? '' : '?add=1'}`} className={`pt-month ${s ? '' : 'missing'}`}>
                        <div className="pt-img">
                          {front ? <img src={front.thumbUrl} alt={`${monthName(m)} front`} loading="lazy" /> : <span className="pt-missing"><Plus size={16} /></span>}
                          {s && !s.complete && <span className="pt-partial">{s.photos.length}/3</span>}
                        </div>
                        <div className="pt-label">
                          <span>{monthName(m, true)}</span>
                          {s?.weightKg && <span className="faint num">{weight(s.weightKg, { unit: false })}</span>}
                        </div>
                      </Link>
                    );
                  })}
              </div>
            </section>
          ))}
        </>
      )}
      <div className="callout mt-24">
        <span>
          Photos are saved exactly as taken — never resized, smoothed, reshaped or enhanced. They live in your Almanac data folder and are included in full backups.
        </span>
      </div>
    </div>
  );
}

