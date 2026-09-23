import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';

export interface ComboOption {
  id: number | string;
  label: string;
  hint?: string;
  color?: string | null;
}

interface Props {
  value: string;
  onChange: (text: string, option: ComboOption | null) => void;
  options: ComboOption[];
  placeholder?: string;
  allowCreate?: boolean;
  createLabel?: string;
  id?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}

/**
 * Type-ahead input that remembers what you've used before. Frequently used
 * options come first (callers pass them sorted); anything new is created on save.
 */
export function Combobox({ value, onChange, options, placeholder, allowCreate = true, createLabel = 'Create', id, autoFocus, onEnter }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const q = value.trim().toLowerCase();
  const filtered = useMemo(() => {
    const f = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return f.slice(0, 30);
  }, [options, q]);
  const exact = options.some((o) => o.label.toLowerCase() === q);
  const showCreate = allowCreate && q && !exact;
  const total = filtered.length + (showCreate ? 1 : 0);

  useEffect(() => {
    const on = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', on);
    return () => document.removeEventListener('pointerdown', on);
  }, []);
  useEffect(() => setActive(0), [q]);

  const choose = (i: number) => {
    if (i < filtered.length) onChange(filtered[i].label, filtered[i]);
    else onChange(value.trim(), null);
    setOpen(false);
  };

  return (
    <div className="combo" ref={wrap}>
      <input
        id={id}
        className="input"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={open && total > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const text = e.target.value;
          const match = options.find((o) => o.label.toLowerCase() === text.trim().toLowerCase()) ?? null;
          onChange(text, match);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(total - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter') {
            if (open && total > 0 && q) {
              e.preventDefault();
              choose(active);
            } else if (onEnter) {
              e.preventDefault();
              onEnter();
            }
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          } else if (e.key === 'Tab') setOpen(false);
        }}
      />
      {open && total > 0 && (
        <div className="combo-list" role="listbox" id={listId}>
          {filtered.map((o, i) => (
            <button
              type="button"
              key={o.id}
              role="option"
              aria-selected={i === active}
              data-active={i === active}
              className="combo-opt"
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              {o.color && <span className="avatar-dot" style={{ background: o.color }} />}
              <span className="truncate">{o.label}</span>
              {o.hint && <span className="hint">{o.hint}</span>}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              role="option"
              aria-selected={active === filtered.length}
              data-active={active === filtered.length}
              className="combo-opt"
              onMouseEnter={() => setActive(filtered.length)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(filtered.length)}
            >
              <Plus size={14} />
              <span className="truncate">
                {createLabel} “{value.trim()}”
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
