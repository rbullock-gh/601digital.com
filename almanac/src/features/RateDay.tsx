import { useEffect, useState } from 'react';
import { api, refreshAll } from '../lib/api.ts';
import { useUI } from '../lib/ui.tsx';
import { RATING_LONG } from '../lib/format.ts';
import { RatingPicker } from './forms.tsx';
import type { Rating } from '../../shared/types.ts';
import type { ISODate } from '../../shared/dates.ts';

/**
 * "How was today?" — one tap saves. Afterwards it gently offers a note,
 * which can be ignored entirely.
 */
export function RateDay({ date, rating, journal, title = 'How was today?', compact }: { date: ISODate; rating: Rating | null; journal: string | null; title?: string; compact?: boolean }) {
  const ui = useUI();
  const [value, setValue] = useState<Rating | null>(rating);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState(journal ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(rating), [rating]);
  useEffect(() => setText(journal ?? ''), [journal]);

  const rate = async (r: Rating) => {
    const first = value == null;
    setValue(r);
    try {
      await api.put(`/days/${date}`, { rating: r });
      await refreshAll();
      if (first && !journal) setAsking(true);
      else ui.toast(`Changed to ${RATING_LONG[r].toLowerCase()}`);
    } catch (e) {
      setValue(rating);
      ui.error(e);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/days/${date}`, { journal: text });
      await refreshAll();
      setAsking(false);
      ui.toast('Saved to your journal', { tone: 'success' });
    } catch (e) {
      ui.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rate-day">
      {title && <div className="rate-title">{title}</div>}
      <RatingPicker value={value} onChange={rate} compact={compact} />
      {asking && (
        <div className="rate-note">
          <label htmlFor={`note-${date}`} className="field-label">
            Want to add anything about today?
          </label>
          <textarea
            id={`note-${date}`}
            className="textarea"
            rows={3}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Finished the homepage for the HVAC site, good workout, felt productive."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
            }}
          />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setAsking(false)}>
              Skip
            </button>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || !text.trim()}>
              Save note
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
