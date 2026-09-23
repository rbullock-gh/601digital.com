import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
  /** Ask before closing (e.g. unsaved input). Return false to keep it open. */
  canClose?: () => boolean;
  initialFocus?: string;
  bare?: boolean;
}

const stack: symbol[] = [];

/** Centered modal on desktop, bottom sheet on phones. Focus is trapped and restored. */
export function Dialog({ open, onClose, title, subtitle, children, footer, width, className, canClose, initialFocus, bare }: Props) {
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);
  const me = useRef(Symbol('dialog'));

  useEffect(() => {
    if (open) {
      restore.current = document.activeElement as HTMLElement;
      setRender(true);
      setClosing(false);
    } else if (render) {
      setClosing(true);
      const t = window.setTimeout(() => {
        setRender(false);
        setClosing(false);
        restore.current?.focus?.();
      }, 180);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const requestClose = useCallback(() => {
    if (canClose && !canClose()) return;
    onClose();
  }, [canClose, onClose]);

  useEffect(() => {
    if (!render || closing) return;
    const id = me.current;
    stack.push(id);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => {
      const el = panel.current;
      if (!el) return;
      const target =
        (initialFocus && el.querySelector<HTMLElement>(initialFocus)) ||
        el.querySelector<HTMLElement>('[data-autofocus]') ||
        el.querySelector<HTMLElement>('input:not([type=hidden]), textarea, select') ||
        el;
      if (window.matchMedia('(pointer: coarse)').matches && target !== el && !target.hasAttribute('data-autofocus')) el.focus();
      else target.focus({ preventScroll: true });
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        requestClose();
      }
      if (e.key === 'Tab' && panel.current) {
        const f = [...panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
          (x) => !x.hasAttribute('disabled') && x.offsetParent !== null,
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(id), 1);
      if (!stack.length) document.body.style.overflow = prevOverflow;
    };
  }, [render, closing, requestClose, initialFocus]);

  if (!render) return null;
  return createPortal(
    <div
      className={`dialog-scrim ${closing ? 'closing' : ''} ${className ?? ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panel}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        style={width ? ({ '--w': `${width}px` } as React.CSSProperties) : undefined}
      >
        <div className="sheet-grip" aria-hidden />
        {bare ? (
          children
        ) : (
          <>
            {title != null && (
              <div className="dialog-head">
                <div className="grow">
                  <h2>{title}</h2>
                  {subtitle && <div className="sub">{subtitle}</div>}
                </div>
                <button className="btn btn-ghost btn-icon btn-sm close" onClick={requestClose} aria-label="Close">
                  <X />
                </button>
              </div>
            )}
            <div className="dialog-body">{children}</div>
            {footer && <div className="dialog-foot">{footer}</div>}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
