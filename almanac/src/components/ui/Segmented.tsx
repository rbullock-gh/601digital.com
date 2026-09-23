import { useLayoutEffect, useRef, useState } from 'react';

interface Props<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  size?: 'sm';
  block?: boolean;
  label?: string;
}

/** Segmented control with a sliding thumb. */
export function Segmented<T extends string>({ value, onChange, options, size, block, label }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    const ro = new ResizeObserver(() => {
      const b = ref.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
      if (b) setThumb({ left: b.offsetLeft, width: b.offsetWidth });
    });
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [value, options.length]);
  return (
    <div ref={ref} className={`seg ${size === 'sm' ? 'seg-sm' : ''} ${block ? 'seg-block' : ''}`} role="group" aria-label={label}>
      {thumb && <span className="seg-thumb" style={{ left: thumb.left, width: thumb.width }} aria-hidden />}
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
