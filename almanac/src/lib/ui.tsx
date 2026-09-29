import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check } from 'lucide-react';
import { Dialog } from '../components/ui/Dialog.tsx';
import { api, refreshAll } from './api.ts';

export type AddKind = 'menu' | 'work' | 'income' | 'workout' | 'body' | 'weight' | 'photos' | 'day' | 'goal' | 'note' | 'win' | 'project' | 'screen' | 'trip' | 'vision';

interface Toast {
  id: number;
  message: ReactNode;
  tone?: 'default' | 'error' | 'success';
  action?: { label: string; run: () => void };
  leaving?: boolean;
}

interface ConfirmOpts {
  title: string;
  body?: ReactNode;
  confirm?: string;
  danger?: boolean;
}

interface AddState {
  kind: AddKind;
  preset?: Record<string, unknown>;
}

interface UI {
  toast: (message: ReactNode, opts?: { tone?: Toast['tone']; action?: Toast['action']; ms?: number }) => void;
  error: (e: unknown) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  /** Soft-delete with an Undo toast. */
  deleted: (what: string, table: string, id: number) => void;
  add: AddState | null;
  openAdd: (kind?: AddKind, preset?: Record<string, unknown>) => void;
  closeAdd: () => void;
  cmdOpen: boolean;
  setCmdOpen: (v: boolean) => void;
  stopOpen: boolean;
  setStopOpen: (v: boolean) => void;
}

const Ctx = createContext<UI | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [add, setAdd] = useState<AddState | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 200);
  }, []);

  const toast = useCallback<UI['toast']>(
    (message, opts = {}) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-2), { id, message, tone: opts.tone, action: opts.action }]);
      window.setTimeout(() => dismiss(id), opts.ms ?? (opts.action ? 6500 : 3200));
    },
    [dismiss],
  );

  const error = useCallback((e: unknown) => toast(e instanceof Error ? e.message : 'Something went wrong', { tone: 'error', ms: 5000 }), [toast]);

  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setConfirmState({ ...o, resolve })), []);

  const deleted = useCallback<UI['deleted']>(
    (what, table, id) => {
      refreshAll();
      toast(`${what} deleted`, {
        action: {
          label: 'Undo',
          run: async () => {
            try {
              await api.post('/undo', { table, id });
              await refreshAll();
              toast(`${what} restored`, { tone: 'success' });
            } catch (e) {
              error(e);
            }
          },
        },
      });
    },
    [toast, error],
  );

  const value = useMemo<UI>(
    () => ({
      toast,
      error,
      confirm,
      deleted,
      add,
      openAdd: (kind = 'menu', preset) => setAdd({ kind, preset }),
      closeAdd: () => setAdd(null),
      cmdOpen,
      setCmdOpen,
      stopOpen,
      setStopOpen,
    }),
    [toast, error, confirm, deleted, add, cmdOpen, stopOpen],
  );

  const close = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {createPortal(
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.tone === 'error' ? 'error' : ''} ${t.leaving ? 'leaving' : ''}`} role="status">
              {t.tone === 'error' ? <AlertCircle className="toast-icon" /> : t.tone === 'success' ? <Check className="toast-icon" /> : null}
              <span className="msg">{t.message}</span>
              {t.action && (
                <button
                  className="toast-action"
                  onClick={() => {
                    t.action!.run();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
      <Dialog
        open={!!confirmState}
        onClose={() => close(false)}
        title={confirmState?.title}
        width={420}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => close(false)}>
              Cancel
            </button>
            <button className={`btn ${confirmState?.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} data-autofocus>
              {confirmState?.confirm ?? 'Confirm'}
            </button>
          </>
        }
      >
        <div className="muted" style={{ fontSize: 'var(--fs-14)' }}>
          {confirmState?.body}
        </div>
      </Dialog>
    </Ctx.Provider>
  );
}

export function useUI(): UI {
  const v = useContext(Ctx);
  if (!v) throw new Error('UIProvider missing');
  return v;
}
