import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, MapPin, Pencil, Plus, Sparkles, Target, Trash2, Undo2 } from 'lucide-react';
import { api, refreshAll } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useUI } from '../lib/ui.tsx';
import { useDocumentTitle, useElementWidth } from '../lib/hooks.ts';
import { shortDate } from '../lib/format.ts';
import { Empty, ErrorBox, Meter, PageHead, PageSkeleton } from '../components/ui/primitives.tsx';
import { Dialog } from '../components/ui/Dialog.tsx';
import { goalNumbers } from '../features/shared.tsx';
import { VisionForm } from '../features/lifeForms.tsx';
import type { ISODate } from '../../shared/dates.ts';
import type { VisionItem } from '../../shared/types.ts';

/** A card is achieved when you say so, when its target goal is reached, or when you've been to its place. */
export function visionDone(v: VisionItem): ISODate | null {
  if (v.achievedOn) return v.achievedOn;
  if (v.goal && v.goal.period === 'target' && v.goal.done) return v.goal.completedOn ?? null;
  if (v.placeId && v.placeStatus === 'visited') return v.placeVisitedOn;
  return null;
}
const isDone = (v: VisionItem) => !!(v.achievedOn || (v.goal?.period === 'target' && v.goal.done) || (v.placeId && v.placeStatus === 'visited'));

type Filter = 'all' | 'open' | 'done' | string;

export default function Vision() {
  const ui = useUI();
  useDocumentTitle('Vision Board');
  const q = useQuery({ queryKey: ['vision'], queryFn: () => api.get<{ items: VisionItem[]; areas: string[] }>('/vision') });
  const [filter, setFilter] = useState<Filter>('all');
  const [order, setOrder] = useState<number[] | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [editing, setEditing] = useState<VisionItem | null>(null);

  useEffect(() => setOrder(null), [q.data]);
  // Deep link from search: /vision#card-12
  useEffect(() => {
    const m = window.location.hash.match(/^#card-(\d+)$/);
    if (m && q.data) setFocusId(Number(m[1]));
  }, [q.data]);

  const items = useMemo(() => {
    const all = q.data?.items ?? [];
    if (!order) return all;
    const byId = new Map(all.map((i) => [i.id, i]));
    return order.map((id) => byId.get(id)).filter((x): x is VisionItem => !!x);
  }, [q.data, order]);
  const shown = items.filter((v) => (filter === 'all' ? true : filter === 'open' ? !isDone(v) : filter === 'done' ? isDone(v) : v.area === filter));
  const areas = [...new Set(items.map((i) => i.area).filter((a): a is string => !!a))];

  const move = async (id: number, beforeId: number | null) => {
    const ids = items.map((i) => i.id).filter((x) => x !== id);
    const at = beforeId == null ? ids.length : ids.indexOf(beforeId);
    ids.splice(at < 0 ? ids.length : at, 0, id);
    setOrder(ids);
    try {
      await api.post('/vision/reorder', { ids });
      await refreshAll();
    } catch (e) {
      ui.error(e);
    }
  };
  const nudge = (id: number, dir: -1 | 1) => {
    const ids = items.map((i) => i.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(ids);
    api.post('/vision/reorder', { ids }).then(refreshAll, ui.error);
  };

  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const focus = items.find((i) => i.id === focusId) ?? null;
  const doneCount = items.filter(isDone).length;

  return (
    <div className="page page-wide">
      <PageHead
        title="Vision Board"
        sub={items.length ? `${items.length} cards · ${doneCount} achieved. Link a card to a goal and it fills in as you go.` : 'Pictures and words for where you’re headed.'}
        actions={
          <button className="btn btn-primary" onClick={() => ui.openAdd('vision', { direct: true })}>
            <Plus /> Add
          </button>
        }
      />
      {!items.length ? (
        <div className="card">
          <Empty icon={<Sparkles />} title="Build your board" action={<button className="btn btn-primary btn-sm" onClick={() => ui.openAdd('vision', { direct: true })}>Add the first card</button>}>
            Add photos of places, things and people that pull you forward — or a few words. Tie a card to a goal and its progress shows right on the board.
          </Empty>
        </div>
      ) : (
        <>
          <div className="row wrap vb-filters" role="toolbar" aria-label="Filter cards">
            {(['all', 'open', 'done'] as const).map((f) => (
              <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'open' ? 'Still ahead' : `Achieved · ${doneCount}`}
              </button>
            ))}
            <span className="vb-sep" aria-hidden />
            {areas.map((a) => (
              <button key={a} className="chip" aria-pressed={filter === a} onClick={() => setFilter(filter === a ? 'all' : a)}>
                {a}
              </button>
            ))}
          </div>
          <Board shown={shown} items={items} draggable={filter === 'all'} dragId={dragId} setDragId={setDragId} move={move} onOpen={setFocusId} />
          {filter === 'all' && items.length > 1 && <div className="faint vb-tip">Drag cards to rearrange.</div>}
        </>
      )}

      <Dialog open={!!focus} onClose={() => (setFocusId(null), history.replaceState(null, '', window.location.pathname))} title={focus?.title ?? focus?.area ?? 'Vision'} width={focus?.kind === 'image' ? 720 : 520}>
        {focus && (
          <FocusCard
            v={focus}
            index={items.indexOf(focus)}
            count={items.length}
            onNudge={(d) => nudge(focus.id, d)}
            onEdit={() => (setEditing(focus), setFocusId(null))}
            onClose={() => setFocusId(null)}
          />
        )}
      </Dialog>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Edit card" width={580}>
        {editing && <VisionForm item={editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

/** Masonry: each card goes into the shortest column, left to right. */
function Board({ shown, items, draggable, dragId, setDragId, move, onOpen }: {
  shown: VisionItem[];
  items: VisionItem[];
  draggable: boolean;
  dragId: number | null;
  setDragId: (id: number | null) => void;
  move: (id: number, beforeId: number | null) => void;
  onOpen: (id: number) => void;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const cols = width ? Math.max(width >= 340 ? 2 : 1, Math.min(4, Math.floor((width + 16) / 256))) : 0;
  const columns = useMemo(() => {
    const out: { items: VisionItem[]; h: number }[] = Array.from({ length: cols }, () => ({ items: [], h: 0 }));
    if (!cols) return out;
    for (const v of shown) {
      const est = v.kind === 'image' ? (v.height && v.width ? v.height / v.width : 1) + (v.goal ? 0.28 : 0.12) : 0.5 + Math.min(0.8, (v.body?.length ?? 0) / 160);
      const c = out.reduce((a, b) => (b.h < a.h ? b : a));
      c.items.push(v);
      c.h += est;
    }
    return out;
  }, [shown, cols]);
  return (
    <div ref={ref} className="vb" style={{ '--cols': Math.max(1, cols) } as React.CSSProperties}>
      {columns.map((c, ci) => (
        <div
          key={ci}
          className="vb-col"
          onDragOver={(e) => dragId != null && e.preventDefault()}
          onDrop={(e) => {
            if (dragId == null || (e.target as HTMLElement).closest('.vcard')) return;
            e.preventDefault();
            // Dropped below the last card in a column: place after it.
            const last = c.items[c.items.length - 1];
            const idx = last ? items.findIndex((i) => i.id === last.id) : -1;
            move(dragId, items[idx + 1]?.id ?? null);
            setDragId(null);
          }}
        >
          {c.items.map((v) => (
            <VisionCard
              key={v.id}
              v={v}
              dragging={dragId === v.id}
              draggable={draggable}
              onOpen={() => onOpen(v.id)}
              onDragStart={() => setDragId(v.id)}
              onDragEnd={() => setDragId(null)}
              onDropOn={() => {
                if (dragId != null && dragId !== v.id) move(dragId, v.id);
                setDragId(null);
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function CardMeta({ v }: { v: VisionItem }) {
  const done = visionDone(v);
  return (
    <>
      {v.goal && !(done && v.goal.period === 'target') && (
        <div className="vcard-goal">
          <div className="row" style={{ gap: 6 }}>
            <Target size={13} />
            <span className="truncate grow">{v.goal.title}</span>
            <span className="num">{Math.round(v.goal.pct * 100)}%</span>
          </div>
          <Meter value={v.goal.pct} done={v.goal.done} thin label={v.goal.title} />
        </div>
      )}
      {v.placeName && !done && (
        <div className="vcard-place">
          <MapPin size={13} /> {v.placeName}
          {v.targetDate && <span className="faint"> · by {shortDate(v.targetDate, true)}</span>}
        </div>
      )}
    </>
  );
}

function VisionCard({ v, dragging, draggable, onOpen, onDragStart, onDragEnd, onDropOn }: { v: VisionItem; dragging: boolean; draggable: boolean; onOpen: () => void; onDragStart: () => void; onDragEnd: () => void; onDropOn: () => void }) {
  const [over, setOver] = useState(false);
  const done = isDone(v);
  const doneOn = visionDone(v);
  return (
    <article
      id={`card-${v.id}`}
      className={`vcard ${v.kind} ${v.kind === 'quote' ? `vt-${v.tone ?? 'sand'}` : ''} ${done ? 'achieved' : ''} ${dragging ? 'dragging' : ''} ${over ? 'drop' : ''}`}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(v.id));
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDropOn();
      }}
    >
      <button className="vcard-open" onClick={onOpen} aria-label={`Open ${v.title ?? v.body ?? 'card'}`}>
        {v.kind === 'image' ? (
          <>
            <div className="vcard-img" style={{ aspectRatio: v.width && v.height ? `${v.width} / ${v.height}` : '4 / 5' }}>
              <img src={v.thumbUrl ?? v.imageUrl ?? ''} alt={v.title ?? ''} loading="lazy" draggable={false} />
              {(v.title || v.area) && (
                <div className="vcard-cap">
                  {v.area && <span className="vcard-area">{v.area}</span>}
                  {v.title && <h3>{v.title}</h3>}
                </div>
              )}
            </div>
            {(v.body || v.goal || v.placeName) && (
              <div className="vcard-body">
                {v.body && <p>{v.body}</p>}
                <CardMeta v={v} />
              </div>
            )}
          </>
        ) : (
          <div className="vcard-quote">
            {v.area && <span className="vcard-area">{v.area}</span>}
            {v.title && <h3>{v.title}</h3>}
            {v.body && <blockquote>{v.body}</blockquote>}
            <CardMeta v={v} />
          </div>
        )}
      </button>
      {done && (
        <span className="vcard-done">
          <Check /> {doneOn ? `Achieved ${shortDate(doneOn, true)}` : 'Achieved'}
        </span>
      )}
    </article>
  );
}

function FocusCard({ v, index, count, onNudge, onEdit, onClose }: { v: VisionItem; index: number; count: number; onNudge: (d: -1 | 1) => void; onEdit: () => void; onClose: () => void }) {
  const ui = useUI();
  const boot = useBoot();
  const done = visionDone(v);
  const act = async (patch: Partial<VisionItem>, msg: string) => {
    try {
      await api.put(`/vision/${v.id}`, patch);
      await refreshAll();
      ui.toast(msg);
    } catch (e) {
      ui.error(e);
    }
  };
  const remove = async () => {
    await api.del(`/vision/${v.id}`);
    onClose();
    ui.deleted('Card', 'vision_items', v.id);
  };
  return (
    <div className="stack-16">
      {v.kind === 'image' ? (
        <div className="vfocus-img">
          <img src={v.imageUrl ?? ''} alt={v.title ?? ''} />
        </div>
      ) : (
        <div className={`vcard-quote vfocus-quote vt-${v.tone ?? 'sand'}`}>
          <blockquote>{v.body}</blockquote>
        </div>
      )}
      {v.kind === 'image' && v.body && <p className="vfocus-body">{v.body}</p>}
      <div className="row wrap" style={{ gap: 8 }}>
        {v.area && <span className="badge">{v.area}</span>}
        {v.placeName && (
          <span className="badge">
            <MapPin size={12} /> {v.placeName}
          </span>
        )}
        {v.targetDate && <span className="badge">By {shortDate(v.targetDate, true)}</span>}
        {done && (
          <span className="badge badge-good">
            <Check size={12} /> Achieved {shortDate(done, true)}
          </span>
        )}
      </div>
      {v.goal && (
        <div className="vfocus-goal">
          <div className="row" style={{ gap: 8 }}>
            <Target size={15} />
            <b className="grow truncate">{v.goal.title}</b>
            <span className="num faint">{goalNumbers(v.goal).join('')}</span>
          </div>
          <Meter value={v.goal.pct} done={v.goal.done} label={v.goal.title} />
        </div>
      )}
      <div className="form-foot" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-danger" onClick={remove} style={{ marginRight: 'auto' }}>
          <Trash2 /> Delete
        </button>
        <button className="btn btn-ghost btn-icon" aria-label="Move earlier" disabled={index <= 0} onClick={() => onNudge(-1)}>
          <ChevronLeft />
        </button>
        <button className="btn btn-ghost btn-icon" aria-label="Move later" disabled={index >= count - 1} onClick={() => onNudge(1)}>
          <ChevronRight />
        </button>
        <button className="btn btn-secondary" onClick={onEdit}>
          <Pencil /> Edit
        </button>
        {v.achievedOn ? (
          <button className="btn btn-secondary" onClick={() => act({ achievedOn: null }, 'Marked as still ahead')}>
            <Undo2 /> Not yet
          </button>
        ) : (
          !done && (
            <button className="btn btn-primary" onClick={() => act({ achievedOn: boot.today }, 'Marked achieved')}>
              <Check /> Achieved
            </button>
          )
        )}
      </div>
    </div>
  );
}
