import { useState, type FormEvent } from 'react';
import { ArrowRight, FlaskConical, Sprout } from 'lucide-react';
import { api, refreshAll } from '../lib/api.ts';
import { useUI } from '../lib/ui.tsx';
import { BrandMark } from '../components/BrandMark.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';

/** First run: name, a few defaults, then real data or a sample dataset to explore. */
export function Onboarding() {
  const ui = useUI();
  const [name, setName] = useState('');
  const [rate, setRate] = useState('30');
  const [unit, setUnit] = useState<'lb' | 'kg'>('lb');
  const [busy, setBusy] = useState<null | 'real' | 'sample'>(null);

  const start = async (mode: 'real' | 'sample') => {
    setBusy(mode);
    try {
      await api.put('/settings', {
        name: name.trim(),
        defaultRateCents: Math.round((parseFloat(rate) || 0) * 100),
        weightUnit: unit,
        lengthUnit: unit === 'lb' ? 'in' : 'cm',
        onboarded: true,
        weekStart: 1,
      });
      if (mode === 'sample') await api.post('/data/sample');
      await refreshAll();
    } catch (e) {
      ui.error(e);
      setBusy(null);
    }
  };

  return (
    <div className="center-screen">
      <div style={{ position: 'fixed', top: 16, right: 16 }}>
        <ThemeToggle />
      </div>
      <div className="onboard">
        <div className="row" style={{ gap: 10, marginBottom: 28 }}>
          <BrandMark />
          <span className="brand-name" style={{ fontFamily: 'var(--font-serif)', fontSize: 22 }}>
            Almanac
          </span>
        </div>
        <h1>A private record of your days.</h1>
        <p className="lede">
          Work, money, training, your body, and how each day felt — logged once, connected everywhere, kept on your own machine.
        </p>
        <div className="stack-16 mt-24" style={{ marginTop: 32 }}>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="ob-name">What should Almanac call you?</label>
              <input id="ob-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Chris" autoFocus />
            </div>
            <div className="field">
              <label htmlFor="ob-rate">Default hourly rate</label>
              <div className="input-affix">
                <span className="affix">$</span>
                <input id="ob-rate" className="input num" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ''))} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="ob-unit">Units</label>
              <select id="ob-unit" className="select" value={unit} onChange={(e) => setUnit(e.target.value as 'lb' | 'kg')}>
                <option value="lb">Pounds & inches</option>
                <option value="kg">Kilograms & cm</option>
              </select>
            </div>
          </div>
          <div className="stack-8" style={{ marginTop: 24 }}>
            <button className="choice" onClick={() => start('real')} disabled={!!busy}>
              <span className="icon-tile">
                <Sprout />
              </span>
              <span className="grow">
                <h3>Start fresh</h3>
                <p>Begin your real history today. Everything can be changed later in Settings.</p>
              </span>
              <ArrowRight size={16} className="faint" style={{ marginTop: 8 }} />
            </button>
            <button className="choice" onClick={() => start('sample')} disabled={!!busy}>
              <span className="icon-tile">
                <FlaskConical />
              </span>
              <span className="grow">
                <h3>{busy === 'sample' ? 'Building sample data…' : 'Explore with sample data'}</h3>
                <p>Eighteen months of realistic example history, kept completely separate from your real data. Delete it with one click when you’re ready.</p>
              </span>
              <ArrowRight size={16} className="faint" style={{ marginTop: 8 }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PasscodeScreen({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.post('/auth', { passcode: code });
      onDone();
      window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Incorrect passcode');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="center-screen">
      <form className="onboard" style={{ maxWidth: 360 }} onSubmit={submit}>
        <BrandMark />
        <h1 style={{ fontSize: 'var(--fs-38)', marginTop: 20 }}>Almanac is locked.</h1>
        <div className="field mt-24">
          <label htmlFor="pc">Passcode</label>
          <input id="pc" type="password" className="input input-lg" value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="current-password" />
          {err && <div className="field-error">{err}</div>}
        </div>
        <button className="btn btn-primary btn-lg btn-block mt-16" disabled={busy || !code}>
          Unlock
        </button>
      </form>
    </div>
  );
}
