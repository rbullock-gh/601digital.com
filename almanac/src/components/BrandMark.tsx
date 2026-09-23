/** The Almanac mark: a year of days, abstracted to a 3×3 grid with one day lit. */
export function BrandMark({ small }: { small?: boolean }) {
  const s = small ? 22 : 26;
  return (
    <span className="brand-mark" style={{ width: s, height: s }} aria-hidden>
      <svg viewBox="0 0 16 16" width={s * 0.62} height={s * 0.62}>
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => (
            <rect key={`${r}${c}`} x={c * 5.5} y={r * 5.5} width="4.5" height="4.5" rx="1.2" fill="currentColor" opacity={r === 1 && c === 2 ? 1 : 0.42} />
          )),
        )}
      </svg>
    </span>
  );
}
