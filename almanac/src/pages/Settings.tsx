import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, Database, Download, FlaskConical, Keyboard, Lock, RotateCcw, Trash2, Upload } from 'lucide-react';
import { api, refreshAll } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useUI } from '../lib/ui.tsx';
import { useDocumentTitle } from '../lib/hooks.ts';
import { currencySymbol, shortDate } from '../lib/format.ts';
import { Card, PageHead } from '../components/ui/primitives.tsx';
import { Segmented } from '../components/ui/Segmented.tsx';
import { Dialog } from '../components/ui/Dialog.tsx';
import { useCustomTheme, useThemePref } from '../components/ThemeToggle.tsx';
import { ACCENT_PRESETS, customVars, normalizeHex, setCustomTheme, THEME_LABEL, THEME_ORDER, type CustomTheme } from '../lib/theme.ts';
import type { Settings as S } from '../../shared/types.ts';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'SEK', 'NOK', 'DKK', 'MXN', 'BRL', 'INR', 'ZAR', 'SGD'];

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="set-row-s">
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="sr-label">{label}</div>
        {hint && <div className="sr-hint">{hint}</div>}
      </div>
      <div className="sr-control">{children}</div>
    </div>
  );
}

const THEME_SUB = { light: 'Warm paper', dark: 'Deep charcoal', custom: 'Your own accent', system: 'Follows your device' };

/** Colours for the Custom theme card's miniature preview. */
function customPreview(c: CustomTheme): React.CSSProperties {
  const v = customVars(c);
  const light = c.base === 'light';
  return {
    '--tp-bg': light ? '#f1eee7' : v['--bg'],
    '--tp-surface': light ? '#fbfaf7' : v['--surface'],
    '--tp-text': light ? '#1b1a18' : '#edece8',
    '--tp-unrated': light ? '#e5e1d8' : v['--unrated'],
    '--tp-accent': c.accent,
  } as React.CSSProperties;
}

function CustomThemeControls({ custom }: { custom: CustomTheme }) {
  const [hex, setHex] = useState(custom.accent);
  useEffect(() => setHex(custom.accent), [custom.accent]);
  const commitHex = () => {
    const v = normalizeHex(hex);
    if (v) setCustomTheme({ ...custom, accent: v });
    else setHex(custom.accent);
  };
  const isPreset = ACCENT_PRESETS.some((p) => p.hex === custom.accent);
  return (
    <div className="custom-theme">
      <Row label="Base" hint="The background the accent sits on.">
        <Segmented
          size="sm"
          label="Base"
          value={custom.base}
          onChange={(base) => setCustomTheme({ ...custom, base })}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Row>
      <Row label="Accent" hint="Buttons, highlights and today's mark. Text in the accent is adjusted automatically so it stays readable.">
        <div className="accent-picker">
          {ACCENT_PRESETS.map((p) => (
            <button key={p.hex} type="button" className={`color-swatch ${custom.accent === p.hex ? 'on' : ''}`} style={{ background: p.hex }} onClick={() => setCustomTheme({ ...custom, accent: p.hex })} aria-label={p.name} title={p.name} aria-pressed={custom.accent === p.hex} />
          ))}
          <label className={`color-swatch color-pick ${isPreset ? '' : 'on'}`} title="Any color" style={isPreset ? undefined : { background: custom.accent }}>
            <input type="color" aria-label="Pick any accent color" value={custom.accent} onChange={(e) => setCustomTheme({ ...custom, accent: e.target.value })} />
          </label>
          <input
            className="input num accent-hex"
            aria-label="Accent hex code"
            value={hex}
            spellCheck={false}
            maxLength={7}
            onChange={(e) => setHex(e.target.value)}
            onBlur={commitHex}
            onKeyDown={(e) => e.key === 'Enter' && commitHex()}
          />
        </div>
      </Row>
    </div>
  );
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

interface DataInfo {
  dataDir: string;
  datasetDir: string;
  mode: 'real' | 'sample';
  dbBytes: number;
  photoBytes: number;
  photoFiles: number;
  schema: number;
  backups: { name: string; bytes: number | null; modified: string; folder: boolean }[];
}

export default function Settings() {
  const boot = useBoot();
  const ui = useUI();
  const s = boot.settings;
  useDocumentTitle('Settings');
  const [theme, setTheme] = useThemePref();
  const custom = useCustomTheme();
  const [name, setName] = useState(s.name);
  const [rate, setRate] = useState(String(s.defaultRateCents / 100));
  const info = useQuery({ queryKey: ['data-info'], queryFn: () => api.get<DataInfo>('/data/info') });
  const trash = useQuery({ queryKey: ['trash'], queryFn: () => api.get<{ table: string; id: number; kind: string; label: string; date: string | null; deletedAt: string }[]>('/trash') });
  const restoreInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState('');

  const save = async (patch: Partial<S>, msg = 'Saved') => {
    try {
      await api.put('/settings', patch);
      await refreshAll();
      ui.toast(msg);
    } catch (e) {
      ui.error(e);
    }
  };

  const restore = async (file: File) => {
    const ok = await ui.confirm({
      title: 'Restore from this backup?',
      body: 'Your current data will be replaced by the backup. A copy of what’s there now is kept in the backups folder first, so nothing is lost.',
      confirm: 'Restore',
      danger: true,
    });
    if (!ok) return;
    setBusy('restore');
    try {
      const form = new FormData();
      form.set('file', file);
      await api.upload('/data/restore', form);
      await refreshAll();
      ui.toast('Backup restored', { tone: 'success' });
    } catch (e) {
      ui.error(e);
    } finally {
      setBusy(null);
    }
  };

  const importJson = async (file: File) => {
    const ok = await ui.confirm({
      title: 'Import this export?',
      body: 'Records in your current data will be replaced by the file’s contents. Your current database is set aside in the backups folder first. Photos on disk are kept.',
      confirm: 'Import',
      danger: true,
    });
    if (!ok) return;
    setBusy('import');
    try {
      const form = new FormData();
      form.set('file', file);
      await api.upload('/data/import', form);
      await refreshAll();
      ui.toast('Import complete', { tone: 'success' });
    } catch (e) {
      ui.error(e);
    } finally {
      setBusy(null);
    }
  };

  const sample = async (action: 'load' | 'delete' | 'real') => {
    if (action === 'load') {
      const ok = await ui.confirm({ title: 'Explore sample data?', body: 'Almanac switches to a separate sample dataset. Your real data isn’t touched, and you can return to it any time.', confirm: 'Load sample data' });
      if (!ok) return;
    }
    if (action === 'delete') {
      const ok = await ui.confirm({ title: 'Delete sample data?', body: 'The sample dataset is erased and you return to your real data.', confirm: 'Delete sample data', danger: true });
      if (!ok) return;
    }
    setBusy('sample');
    try {
      if (action === 'load') await api.post('/data/sample');
      if (action === 'delete') await api.del('/data/sample');
      if (action === 'real') await api.post('/data/real');
      await refreshAll();
      ui.toast(action === 'load' ? 'Now viewing sample data' : 'Back to your data');
    } catch (e) {
      ui.error(e);
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    setBusy('reset');
    try {
      await api.post("/data/reset", { confirm: resetText });
      await refreshAll();
      setResetOpen(false);
      setResetText('');
      ui.toast('Data reset. The previous copy is in your backups folder.', { ms: 6000 });
    } catch (e) {
      ui.error(e);
    } finally {
      setBusy(null);
    }
  };

  const restoreItem = async (table: string, id: number) => {
    await api.post('/trash/restore', { table, id });
    await refreshAll();
    ui.toast('Restored', { tone: 'success' });
  };

  return (
    <div className="page settings-page">
      <PageHead title="Settings" sub={`Almanac ${boot.version}`} />

      <div className="stack-16">
        <Card title="You">
          <Row label="Name" hint="Used in your greeting.">
            <input className="input" style={{ width: 220 }} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== s.name && save({ name: name.trim() })} />
          </Row>
        </Card>

        <Card title="Appearance">
          <div className="theme-cards">
            {THEME_ORDER.map((t) => (
              <button key={t} className={`theme-card ${theme === t ? 'on' : ''}`} onClick={() => setTheme(t)} aria-pressed={theme === t}>
                <span className={`theme-preview tp-${t}`} style={t === 'custom' ? customPreview(custom) : undefined} aria-hidden>
                  <span className="tp-side" />
                  <span className="tp-main">
                    <span className="tp-line" />
                    <span className="tp-line short" />
                    <span className="tp-dots">
                      <i /><i /><i /><i />
                    </span>
                  </span>
                </span>
                <span className="tc-label">{THEME_LABEL[t]}</span>
                <span className="tc-sub">{THEME_SUB[t]}</span>
              </button>
            ))}
          </div>
          {theme === 'custom' && <CustomThemeControls custom={custom} />}
        </Card>

        <Card title="Work & money">
          <Row label="Default hourly rate" hint="Used when a session or project has no rate of its own. Changing it never rewrites past sessions.">
            <div className="input-affix has-right" style={{ width: 150 }}>
              <span className="affix">{currencySymbol()}</span>
              <input className="input num" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ''))} onBlur={() => save({ defaultRateCents: Math.round((parseFloat(rate) || 0) * 100) })} />
              <span className="affix-r">/h</span>
            </div>
          </Row>
          <Row label="Currency">
            <select className="select" style={{ width: 150 }} value={s.currency} onChange={(e) => save({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Row>
        </Card>

        <Card title="Calendar & formats">
          <Row label="Week starts on">
            <Segmented size="sm" value={String(s.weekStart)} onChange={(v) => save({ weekStart: Number(v) as 0 | 1 })} options={[{ value: '0', label: 'Sunday' }, { value: '1', label: 'Monday' }]} />
          </Row>
          <Row label="Date format">
            <Segmented size="sm" value={s.dateFormat} onChange={(v) => save({ dateFormat: v })} options={[{ value: 'MDY', label: 'Sep 23' }, { value: 'DMY', label: '23 Sep' }, { value: 'YMD', label: '2026 Sep 23' }]} />
          </Row>
          <Row label="Time format">
            <Segmented size="sm" value={s.timeFormat} onChange={(v) => save({ timeFormat: v })} options={[{ value: '12', label: '2:30 PM' }, { value: '24', label: '14:30' }]} />
          </Row>
        </Card>

        <Card title="Fitness & body">
          <Row label="Weight unit" hint="Stored precisely; switching converts everything for display.">
            <Segmented size="sm" value={s.weightUnit} onChange={(v) => save({ weightUnit: v })} options={[{ value: 'lb', label: 'Pounds' }, { value: 'kg', label: 'Kilograms' }]} />
          </Row>
          <Row label="Measurement unit">
            <Segmented size="sm" value={s.lengthUnit} onChange={(v) => save({ lengthUnit: v })} options={[{ value: 'in', label: 'Inches' }, { value: 'cm', label: 'Centimetres' }]} />
          </Row>
          <Row label="Weekly workout target" hint="Used for your weekly streak and the week view.">
            <select className="select" style={{ width: 100 }} value={s.weeklyWorkoutTarget} onChange={(e) => save({ weeklyWorkoutTarget: Number(e.target.value) })}>
              {Array.from({ length: 8 }, (_, i) => (
                <option key={i} value={i}>{i === 0 ? 'None' : i}</option>
              ))}
            </select>
          </Row>
          <Row label="Progress photo day" hint="The reminder appears from this day each month until the set is complete.">
            <select className="select" style={{ width: 100 }} value={s.photoDay} onChange={(e) => save({ photoDay: Number(e.target.value), photoSnoozeUntil: null })}>
              {Array.from({ length: 28 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}</option>
              ))}
            </select>
          </Row>
        </Card>

        <Card title={<span className="row" style={{ gap: 8 }}><Database size={16} /> Your data</span>}>
          <div className="callout" style={{ marginBottom: 16 }}>
            <Lock />
            <span>
              Everything lives on this machine{info.data ? <> in <code className="path">{info.data.datasetDir}</code></> : null}. Almanac makes no network requests to anyone else and has no analytics. A safety snapshot of the database is taken automatically every day (the last 14 are kept).
            </span>
          </div>
          {info.data && (
            <div className="data-stats">
              <span>Database <b>{fmtBytes(info.data.dbBytes)}</b></span>
              <span>Photos <b>{info.data.photoFiles}</b> files · <b>{fmtBytes(info.data.photoBytes)}</b></span>
              <span>Schema v{info.data.schema}</span>
            </div>
          )}
          <Row label="Backup everything" hint="One .zip with the database, all progress photos and a manifest. Keep it somewhere safe — it restores everything.">
            <a className="btn btn-primary" href="/api/data/backup" download>
              <Download /> Download backup
            </a>
          </Row>
          <Row label="Restore from backup" hint="Replaces current data with a backup .zip. Your current data is set aside first.">
            <button className="btn btn-secondary" onClick={() => restoreInput.current?.click()} disabled={busy === 'restore'}>
              <Upload /> {busy === 'restore' ? 'Restoring…' : 'Restore'}
            </button>
            <input ref={restoreInput} type="file" accept=".zip,application/zip" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
          </Row>
          <Row label="Export data (JSON)" hint="Every record in one readable file. Photos aren’t included — use a full backup for those.">
            <a className="btn btn-secondary" href="/api/data/export.json" download>
              <Download /> Export JSON
            </a>
          </Row>
          <Row label="Import data (JSON)" hint="Load an Almanac JSON export.">
            <button className="btn btn-secondary" onClick={() => importInput.current?.click()} disabled={busy === 'import'}>
              <Upload /> Import
            </button>
            <input ref={importInput} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          </Row>
          <Row label="CSV exports" hint="For spreadsheets and taxes.">
            <div className="row wrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
              {[
                ['work', 'Work sessions'],
                ['income', 'Income'],
                ['earnings', 'All earnings'],
                ['workouts', 'Workout sets'],
                ['prs', 'PRs'],
                ['body', 'Body'],
                ['days', 'Days & journal'],
              ].map(([k, l]) => (
                <a key={k} className="btn btn-ghost btn-sm" href={`/api/data/csv/${k}`} download>
                  {l}
                </a>
              ))}
            </div>
          </Row>
          {info.data && info.data.backups.length > 0 && (
            <details className="backup-list">
              <summary>Local snapshots ({info.data.backups.length})</summary>
              {info.data.backups.map((b) => (
                <div key={b.name} className="row" style={{ fontSize: 12, padding: '4px 0' }}>
                  <Archive size={13} className="faint" />
                  <code className="path grow">{b.name}</code>
                  <span className="faint">{b.bytes != null ? fmtBytes(b.bytes) : 'folder'}</span>
                  <span className="faint">{shortDate(b.modified.slice(0, 10), true)}</span>
                </div>
              ))}
              <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>Stored in {info.data.dataDir}/backups</div>
            </details>
          )}
        </Card>

        <Card title={<span className="row" style={{ gap: 8 }}><FlaskConical size={16} /> Sample data</span>}>
          {boot.mode === 'sample' ? (
            <>
              <Row label="You’re viewing sample data" hint="It’s stored separately and never mixes with your real history.">
                <div className="row" style={{ gap: 6 }}>
                  {boot.hasRealData && (
                    <button className="btn btn-secondary" onClick={() => sample('real')} disabled={!!busy}>
                      Return to my data
                    </button>
                  )}
                  <button className="btn btn-danger" onClick={() => sample('delete')} disabled={!!busy}>
                    Delete sample data & start fresh
                  </button>
                </div>
              </Row>
            </>
          ) : (
            <Row label="Explore with sample data" hint="Switch to 18 months of realistic example history in a separate dataset. Your data stays exactly as it is.">
              <button className="btn btn-secondary" onClick={() => sample('load')} disabled={!!busy}>
                {busy === 'sample' ? 'Building…' : 'Load sample data'}
              </button>
            </Row>
          )}
        </Card>

        <Card title="Recently deleted" sub="Everything you delete can be restored here">
          {trash.data?.length ? (
            <div className="list">
              {trash.data.slice(0, 50).map((t) => (
                <div key={`${t.table}-${t.id}`} className="list-row">
                  <span className="badge">{t.kind}</span>
                  <span className="grow truncate">{t.label}</span>
                  <span className="faint nowrap" style={{ fontSize: 12 }}>{t.date ? (t.date.length === 7 ? t.date : shortDate(t.date, true)) : ''}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => restoreItem(t.table, t.id)}>
                    <RotateCcw /> Restore
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="faint" style={{ fontSize: 13 }}>Nothing deleted.</div>
          )}
        </Card>

        <Card title={<span className="row" style={{ gap: 8 }}><Keyboard size={16} /> Keyboard shortcuts</span>}>
          <div className="shortcuts">
            {[
              ['⌘K / Ctrl K', 'Search & commands'],
              ['/', 'Search'],
              ['N', 'Add anything'],
              ['T', 'Today'],
              ['D', 'Dashboard'],
              ['C', 'Calendar'],
              ['Y', 'Year at a glance'],
              ['← →', 'Previous / next day (day view)'],
              ['Esc', 'Close dialogs'],
            ].map(([k, l]) => (
              <div key={k} className="shortcut">
                <span className="kbd">{k}</span>
                <span className="muted">{l}</span>
              </div>
            ))}
          </div>
        </Card>

        {boot.mode === 'real' && (
          <Card title="Danger zone" className="danger-card">
            <Row label="Reset all data" hint="Moves your entire database and photos into the backups folder and starts empty. Recoverable by restoring that copy.">
              <button className="btn btn-secondary" onClick={() => setResetOpen(true)}>
                <Trash2 /> Reset data
              </button>
            </Row>
          </Card>
        )}
      </div>

      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset all data?"
        width={440}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setResetOpen(false)}>Cancel</button>
            <button className="btn btn-danger" disabled={resetText !== 'DELETE' || busy === 'reset'} onClick={reset}>Reset everything</button>
          </>
        }
      >
        <div className="stack-16">
          <p className="muted">Almanac will start empty. Your current database and photos are moved to the backups folder, not destroyed — but they won’t appear in the app unless you restore them.</p>
          <div className="field">
            <label htmlFor="reset-confirm">Type DELETE to confirm</label>
            <input id="reset-confirm" className="input" value={resetText} onChange={(e) => setResetText(e.target.value)} autoComplete="off" />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
