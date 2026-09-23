import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TipState {
  x: number;
  y: number;
  content: ReactNode;
  anchor?: DOMRect;
}

const Ctx = createContext<{ show: (s: TipState) => void; hide: () => void }>({ show: () => {}, hide: () => {} });

/** One shared tooltip layer for charts, grids and calendars. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<TipState | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const show = useCallback((s: TipState) => setTip(s), []);
  const hide = useCallback(() => setTip(null), []);

  useEffect(() => {
    if (!tip || !el.current) return setPos(null);
    const r = el.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left: number;
    let top: number;
    if (tip.anchor) {
      left = tip.anchor.left + tip.anchor.width / 2 - r.width / 2;
      top = tip.anchor.top - r.height - 8;
      if (top < 8) top = tip.anchor.bottom + 8;
    } else {
      left = tip.x + 14;
      top = tip.y - r.height - 14;
      if (left + r.width > vw - 8) left = tip.x - r.width - 14;
      if (top < 8) top = tip.y + 16;
    }
    left = Math.max(8, Math.min(vw - r.width - 8, left));
    top = Math.max(8, Math.min(vh - r.height - 8, top));
    setPos({ left, top });
  }, [tip]);

  useEffect(() => {
    if (!tip) return;
    const off = () => setTip(null);
    window.addEventListener('scroll', off, true);
    return () => window.removeEventListener('scroll', off, true);
  }, [tip]);

  return (
    <Ctx.Provider value={{ show, hide }}>
      {children}
      {tip &&
        createPortal(
          <div ref={el} className="tip" role="tooltip" style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}>
            {tip.content}
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  );
}

export const useTooltip = () => useContext(Ctx);
