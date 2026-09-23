import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Camera, Check, ChevronLeft, ChevronRight, Columns2, ImagePlus, Scale, Trash2, Upload, X } from 'lucide-react';
import { api, refreshAll } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useUI } from '../lib/ui.tsx';
import { useDocumentTitle } from '../lib/hooks.ts';
import { longDate, monthYear, weight } from '../lib/format.ts';
import { Card, PageSkeleton } from '../components/ui/primitives.tsx';
import { Dialog } from '../components/ui/Dialog.tsx';
import { ANGLES, CONSISTENCY, uploadPhoto } from '../features/photoUpload.ts';
import { addMonthsYM, isYearMonth, type ISODate } from '../../shared/dates.ts';
import type { Angle, Photo, PhotoSet } from '../../shared/types.ts';

export default function PhotoMonth() {
  const { month = '' } = useParams();
  if (!isYearMonth(month)) return <Navigate to="/photos" replace />;
  return <MonthView key={month} month={month} />;
}

function MonthView({ month }: { month: string }) {
  const boot = useBoot();
  const ui = useUI();
  const [params, setParams] = useSearchParams();
  const adding = params.get('add') === '1';
  useDocumentTitle(`${monthYear(month)} photos`);
  const q = useQuery({ queryKey: ['photoset', month], queryFn: () => api.get<PhotoSet | null>(`/photos/${month}`) });
  const prev = useQuery({ queryKey: ['photoset', addMonthsYM(month, -1)], queryFn: () => api.get<PhotoSet | null>(`/photos/${addMonthsYM(month, -1)}`) });
  const [uploading, setUploading] = useState<Angle | null>(null);
  const [camera, setCamera] = useState<Angle | null>(null);
  const [viewer, setViewer] = useState<Photo | null>(null);
  const [date, setDate] = useState<ISODate>(month === boot.today.slice(0, 7) ? boot.today : `${month}-01`);
  const isFuture = month > boot.today.slice(0, 7);

  if (q.isLoading) return <PageSkeleton />;
  const set = q.data ?? null;
  const byAngle = new Map((set?.photos ?? []).filter((p) => p.angle !== 'other').map((p) => [p.angle, p]));
  const others = (set?.photos ?? []).filter((p) => p.angle === 'other');
  const prevBy = new Map((prev.data?.photos ?? []).map((p) => [p.angle, p]));
  const canCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;

  const upload = async (angle: Angle, file: Blob) => {
    setUploading(angle);
    try {
      const s = await uploadPhoto(file, { month, date: set?.date ?? date, angle });
      await refreshAll();
      ui.toast(s.complete && !set?.complete ? `${monthYear(month)} photos complete ✓` : `${angle[0].toUpperCase()}${angle.slice(1)} photo saved`, { tone: 'success' });
      if (s.complete && adding) setParams({});
    } catch (e) {
      ui.error(e);
    } finally {
      setUploading(null);
    }
  };

  const remove = async (p: Photo) => {
    await api.del(`/photos/item/${p.id}`);
    ui.deleted('Photo', 'photos', p.id);
    setViewer(null);
  };

  return (
    <div className="page">
      <Link to="/photos" className="back-link">
        <ChevronLeft /> Progress photos
      </Link>
      <header className="page-head">
        <div className="grow">
          <h1 className="serif" style={{ fontWeight: 400, fontSize: 'var(--fs-48)' }}>{monthYear(month)}</h1>
          <div className="sub row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {set ? (
              <>
                {set.complete ? (
                  <span className="badge badge-good">
                    <Check /> Complete
                  </span>
                ) : (
                  <span className="badge badge-okay">{set.photos.filter((p) => p.angle !== 'other').length}/3 angles</span>
                )}
                <span>Taken {longDate(set.date)}</span>
                {set.weightKg && <span>· {weight(set.weightKg)} that week</span>}
              </>
            ) : (
              <span>No photos yet</span>
            )}
          </div>
        </div>
        <div className="actions">
          <Link to={`/photos/${addMonthsYM(month, -1)}`} className="btn btn-secondary btn-icon" aria-label="Previous month">
            <ChevronLeft />
          </Link>
          <Link to={`/photos/${addMonthsYM(month, 1)}`} className={`btn btn-secondary btn-icon ${addMonthsYM(month, 1) > boot.today.slice(0, 7) ? 'disabled-link' : ''}`} aria-label="Next month">
            <ChevronRight />
          </Link>
          {set && (
            <Link to={`/photos/compare?to=${month}`} className="btn btn-secondary">
              <Columns2 /> Compare
            </Link>
          )}
        </div>
      </header>

      {(adding || !set?.complete) && !isFuture && (
        <div className="photo-guide">
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>For honest comparisons, keep it consistent</div>
            <ul className="consistency">
              {CONSISTENCY.map((c) => (
                <li key={c}>
                  <Check size={13} /> {c}
                </li>
              ))}
            </ul>
          </div>
          <div className="guide-side">
            {!set && (
              <label className="field">
                <span className="field-label">Date taken</span>
                <input type="date" className="input input-sm" value={date} min={`${month}-01`} onChange={(e) => setDate(e.target.value)} />
              </label>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => ui.openAdd('body', { date: set?.date ?? date, direct: true })}>
              <Scale /> Log weight & measurements
            </button>
            {prev.data && <div className="faint" style={{ fontSize: 12 }}>Last month’s photo appears beside each slot as a positioning reference{canCamera ? ', and as an overlay in the camera' : ''}.</div>}
          </div>
        </div>
      )}

      <div className="angle-grid">
        {ANGLES.map(({ key, label }) => {
          const p = byAngle.get(key);
          const ref = prevBy.get(key);
          return (
            <div key={key} className="angle-slot">
              <div className="angle-head">
                <span className="eyebrow">{label}</span>
                {p && <Check size={14} className="pos" />}
              </div>
              {p ? (
                <button className="angle-img" onClick={() => setViewer(p)} aria-label={`View ${label} photo`}>
                  <img src={p.url} alt={`${label}, ${monthYear(month)}`} loading="lazy" />
                </button>
              ) : (
                <UploadTile
                  label={label}
                  busy={uploading === key}
                  reference={ref?.thumbUrl}
                  disabled={isFuture}
                  onFile={(f) => upload(key, f)}
                  onCamera={canCamera ? () => setCamera(key) : undefined}
                />
              )}
              {p && (
                <label className="replace-link">
                  Replace
                  <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(key, e.target.files[0])} />
                </label>
              )}
            </div>
          );
        })}
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Additional photos</h2>
          <span className="sub">Optional</span>
          <div className="actions">
            <label className="btn btn-secondary btn-sm">
              <ImagePlus /> Add photo
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload('other', e.target.files[0])} disabled={isFuture} />
            </label>
          </div>
        </div>
        {others.length > 0 ? (
          <div className="photo-thumbs extra">
            {others.map((p) => (
              <button key={p.id} className="photo-thumb" onClick={() => setViewer(p)}>
                <img src={p.thumbUrl} alt="Additional progress photo" loading="lazy" />
              </button>
            ))}
          </div>
        ) : (
          <div className="faint" style={{ fontSize: 13 }}>Flexed, a different angle, anything you want to remember.</div>
        )}
      </section>

      {set && <NoteCard month={month} note={set.note} />}

      <Dialog open={!!viewer} onClose={() => setViewer(null)} bare width={760}>
        {viewer && (
          <div className="viewer">
            <img src={viewer.url} alt={`${viewer.angle} progress photo`} />
            <div className="viewer-bar">
              <span className="eyebrow">
                {viewer.angle} · {monthYear(month)}
              </span>
              <span className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={() => remove(viewer)}>
                <Trash2 /> Delete
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setViewer(null)}>
                <X /> Close
              </button>
            </div>
          </div>
        )}
      </Dialog>
      {camera && <CameraCapture angle={camera} reference={prevBy.get(camera)?.url} onClose={() => setCamera(null)} onCapture={(b) => { setCamera(null); upload(camera, b); }} />}
    </div>
  );
}

function UploadTile({ label, busy, reference, disabled, onFile, onCamera }: { label: string; busy: boolean; reference?: string; disabled?: boolean; onFile: (f: File) => void; onCamera?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      className={`upload-tile ${drag ? 'drag' : ''} ${disabled ? 'disabled' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f && !disabled) onFile(f);
      }}
    >
      {reference && <img className="upload-ref" src={reference} alt="" aria-hidden />}
      <div className="upload-inner">
        {busy ? (
          <span className="faint">Saving…</span>
        ) : (
          <>
            <button className="btn btn-primary btn-sm" onClick={() => input.current?.click()} disabled={disabled}>
              <Upload /> Add {label.toLowerCase()}
            </button>
            {onCamera && (
              <button className="btn btn-secondary btn-sm" onClick={onCamera} disabled={disabled}>
                <Camera /> Camera + guide
              </button>
            )}
            <span className="faint" style={{ fontSize: 11 }}>{reference ? 'Faded: last month' : 'or drop a photo here'}</span>
          </>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </div>
  );
}

/** Live camera with last month's photo as a translucent positioning overlay. */
function CameraCapture({ angle, reference, onClose, onCapture }: { angle: Angle; reference?: string; onClose: () => void; onCapture: (b: Blob) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.35);
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [timer, setTimer] = useState(0);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 3024 }, height: { ideal: 4032 } }, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => {});
        }
      })
      .catch(() => setErr('Camera unavailable. Use “Add photo” to choose a picture instead.'));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [facing]);

  const snap = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob((b) => b && onCapture(b), 'image/jpeg', 0.95);
  };
  const shoot = () => {
    if (!timer) return snap();
    let n = timer;
    setCount(n);
    const id = window.setInterval(() => {
      n--;
      if (n <= 0) {
        window.clearInterval(id);
        setCount(null);
        snap();
      } else setCount(n);
    }, 1000);
  };

  return (
    <div className="camera" role="dialog" aria-label={`Take ${angle} photo`}>
      <div className="camera-stage">
        <video ref={video} playsInline muted className={facing === 'user' ? 'mirror' : ''} />
        {reference && <img src={reference} alt="" className="camera-ref" style={{ opacity }} />}
        {count != null && <div className="camera-count">{count}</div>}
        {err && <div className="camera-err">{err}</div>}
      </div>
      <div className="camera-bar">
        <button className="btn btn-secondary btn-sm" onClick={onClose}>
          <X /> Cancel
        </button>
        {reference && (
          <label className="camera-slider">
            Guide
            <input type="range" min={0} max={0.8} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
          </label>
        )}
        <select className="select input-sm" value={timer} onChange={(e) => setTimer(Number(e.target.value))} aria-label="Timer" style={{ width: 90 }}>
          <option value={0}>No timer</option>
          <option value={3}>3s</option>
          <option value={10}>10s</option>
        </select>
        <button className="btn btn-secondary btn-sm" onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')}>
          Flip
        </button>
        <button className="camera-shutter" onClick={shoot} aria-label="Take photo" />
      </div>
    </div>
  );
}

function NoteCard({ month, note }: { month: string; note: string | null }) {
  const [v, setV] = useState(note ?? '');
  const [saved, setSaved] = useState(true);
  return (
    <Card className="mt-24" title="Note" actions={<span className="faint" style={{ fontSize: 12 }}>{saved ? '' : 'Unsaved'}</span>}>
      <textarea
        className="textarea"
        rows={2}
        value={v}
        placeholder="Lighting, how you felt, anything that’ll help you read these photos later."
        onChange={(e) => {
          setV(e.target.value);
          setSaved(false);
        }}
        onBlur={async () => {
          await api.put(`/photos/${month}`, { note: v });
          setSaved(true);
          refreshAll();
        }}
      />
    </Card>
  );
}
