import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, Minus } from 'lucide-react';
import type { Rating } from '../../../shared/types.ts';
import { RATING_LABEL } from '../../lib/format.ts';

export function PageHead({ title, sub, actions, back }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <header className="page-head">
      <div className="grow" style={{ minWidth: 220 }}>
        {back && (
          <Link to={back.to} className="back-link">
            <ChevronLeft /> {back.label}
          </Link>
        )}
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function Card({ title, sub, actions, children, className, flush, id }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean; id?: string }) {
  return (
    <section className={`card ${flush ? 'card-flush' : ''} ${className ?? ''}`} id={id}>
      {(title || actions) && (
        <div className="card-head" style={flush ? { padding: '18px 20px 0' } : undefined}>
          {title && <h2>{title}</h2>}
          {sub && <span className="sub">{sub}</span>}
          {actions && <div className="actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function SectionHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {sub && <span className="sub">{sub}</span>}
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, foot, size, icon }: { label: ReactNode; value: ReactNode; foot?: ReactNode; size?: 'sm' | 'lg'; icon?: ReactNode }) {
  return (
    <div className={`stat ${size ? `stat-${size}` : ''}`}>
      <div className="stat-label">
        {icon}
        {label}
      </div>
      <div className="stat-value">{value}</div>
      {foot && <div className="stat-foot">{foot}</div>}
    </div>
  );
}

/** Signed change vs a named period. `goodWhenUp` flips the colour for things like weight. */
export function Delta({ current, previous, format, goodWhenUp = true, label, asPct = true }: {
  current: number;
  previous: number;
  format?: (n: number) => string;
  goodWhenUp?: boolean;
  label?: string;
  asPct?: boolean;
}) {
  const diff = current - previous;
  if (previous === 0 && current === 0) return <span className="delta">—</span>;
  const flat = Math.abs(diff) < 1e-9;
  const up = diff > 0;
  const good = flat ? null : up === goodWhenUp;
  const text =
    asPct && previous !== 0
      ? `${Math.abs(Math.round((diff / Math.abs(previous)) * 100))}%`
      : format
        ? format(Math.abs(diff))
        : String(Math.abs(diff));
  return (
    <span className={`delta ${good === null ? '' : good ? 'up' : 'down'}`} title={label}>
      {flat ? <Minus /> : up ? <ArrowUpRight /> : <ArrowDownRight />}
      {previous === 0 && asPct ? 'new' : text}
      {label && <span style={{ color: 'var(--text-3)', fontWeight: 450, marginLeft: 4 }}>{label}</span>}
    </span>
  );
}

export function Meter({ value, color, done, thin, label }: { value: number; color?: string; done?: boolean; thin?: boolean; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      className={`meter ${thin ? 'meter-thin' : ''} ${done ? 'done' : ''}`}
      style={color ? ({ '--c': color } as React.CSSProperties) : undefined}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label}
    >
      <span style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Empty({ icon, title, children, action, small }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; small?: boolean }) {
  return (
    <div className={`empty ${small ? 'empty-sm' : ''}`}>
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', r, style }: { h?: number; w?: number | string; r?: number; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r, ...style }} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      <Skeleton h={30} w={240} />
      <Skeleton h={14} w={180} style={{ marginTop: 10 }} />
      <div className="grid grid-4" style={{ marginTop: 32 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} h={96} r={12} />
        ))}
      </div>
      <Skeleton h={260} r={12} style={{ marginTop: 16 }} />
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="error-box row">
      <span className="grow">{error instanceof Error ? error.message : 'Something went wrong.'}</span>
      {retry && (
        <button className="btn btn-secondary btn-sm" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function RatingDot({ rating, size }: { rating: Rating | null | undefined; size?: number }) {
  return <span className={`rating-dot ${rating ? `r${rating}` : ''}`} style={size ? { width: size, height: size } : undefined} aria-hidden />;
}

export function RatingBadge({ rating }: { rating: Rating | null | undefined }) {
  if (!rating) return <span className="badge">Not rated</span>;
  const cls = rating === 3 ? 'badge-good' : rating === 2 ? 'badge-okay' : 'badge-bad';
  return (
    <span className={`badge ${cls}`}>
      <RatingDot rating={rating} size={8} />
      {RATING_LABEL[rating]}
    </span>
  );
}
