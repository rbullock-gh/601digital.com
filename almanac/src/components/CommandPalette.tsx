import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Award,
  BookOpen,
  Briefcase,
  CalendarDays,
  Camera,
  CircleDot,
  DollarSign,
  Dumbbell,
  FileText,
  FolderKanban,
  MapPin,
  Moon,
  Palette,
  Play,
  Scale,
  Search,
  Smartphone,
  Sparkles,
  SquarePen,
  Square,
  StickyNote,
  Sun,
  Target,
  Trophy,
} from 'lucide-react';
import { useUI } from '../lib/ui.tsx';
import { useBoot } from '../lib/boot.ts';
import { api } from '../lib/api.ts';
import { Dialog } from './ui/Dialog.tsx';
import { NAV } from './Shell.tsx';
import { useTimerActions } from './Timer.tsx';
import { setThemePref } from '../lib/theme.ts';
import type { SearchResult } from '../../shared/types.ts';

interface Item {
  id: string;
  group: string;
  title: string;
  sub?: string;
  icon: ReactNode;
  hint?: string;
  keywords?: string;
  run: () => void;
}

const KIND_ICON: Record<SearchResult['kind'], ReactNode> = {
  page: <FileText />,
  action: <CircleDot />,
  day: <CalendarDays />,
  month: <CalendarDays />,
  session: <Briefcase />,
  income: <DollarSign />,
  project: <FolderKanban />,
  exercise: <Dumbbell />,
  workout: <Dumbbell />,
  note: <StickyNote />,
  journal: <BookOpen />,
  accomplishment: <Trophy />,
  goal: <Target />,
  place: <MapPin />,
  vision: <Sparkles />,
};

function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = window.setTimeout(() => setD(v), ms);
    return () => window.clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function CommandPalette() {
  const ui = useUI();
  const boot = useBoot();
  const navigate = useNavigate();
  const timer = useTimerActions();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const dq = useDebounced(q.trim(), 140);
  const open = ui.cmdOpen;

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
    }
  }, [open]);

  const results = useQuery({
    queryKey: ['search', dq],
    queryFn: () => api.get<SearchResult[]>(`/search?q=${encodeURIComponent(dq)}`),
    enabled: open && dq.length >= 2,
    staleTime: 10_000,
  });

  const close = () => ui.setCmdOpen(false);
  const go = (to: string) => () => {
    close();
    navigate(to);
  };
  const add = (k: Parameters<typeof ui.openAdd>[0]) => () => {
    close();
    window.setTimeout(() => ui.openAdd(k, { direct: true }), 60);
  };
  const year = boot.today.slice(0, 4);
  const month = boot.today.slice(0, 7);

  const actions: Item[] = useMemo(
    () => [
      boot.timer
        ? { id: 'stop', group: 'Actions', title: 'Stop work', icon: <Square />, keywords: 'timer end finish', run: () => (close(), timer.stop()) }
        : { id: 'start', group: 'Actions', title: 'Start work', icon: <Play />, keywords: 'timer begin clock in', run: () => (close(), timer.start()) },
      { id: 'a-work', group: 'Actions', title: 'Add work session', icon: <Briefcase />, keywords: 'log hours', run: add('work') },
      { id: 'a-income', group: 'Actions', title: 'Add income', icon: <DollarSign />, keywords: 'money payment', run: add('income') },
      { id: 'a-workout', group: 'Actions', title: 'Start workout', icon: <Dumbbell />, keywords: 'gym lift log', run: go('/gym/new') },
      { id: 'a-weight', group: 'Actions', title: 'Log weight', icon: <Scale />, keywords: 'body scale', run: add('weight') },
      { id: 'a-body', group: 'Actions', title: 'Log body measurements', icon: <Scale />, keywords: 'waist chest arms', run: add('body') },
      { id: 'a-photos', group: 'Actions', title: 'Add progress photos', icon: <Camera />, keywords: 'picture', run: go(`/photos/${month}?add=1`) },
      { id: 'a-rate', group: 'Actions', title: 'Rate today', icon: <SquarePen />, keywords: 'good okay bad journal day', run: add('day') },
      { id: 'a-note', group: 'Actions', title: 'Add note', icon: <StickyNote />, run: add('note') },
      { id: 'a-win', group: 'Actions', title: 'Add a win', icon: <Trophy />, keywords: 'accomplishment milestone', run: add('win') },
      { id: 'a-goal', group: 'Actions', title: 'New goal', icon: <Target />, run: add('goal') },
      { id: 'a-screen', group: 'Actions', title: 'Log screen time', icon: <Smartphone />, keywords: 'phone usage minutes', run: add('screen') },
      { id: 'a-trip', group: 'Actions', title: 'Add a trip', icon: <MapPin />, keywords: 'travel visit place map pin vacation', run: add('trip') },
      { id: 'a-vision', group: 'Actions', title: 'Add to vision board', icon: <Sparkles />, keywords: 'dream image quote inspiration', run: add('vision') },
      { id: 'a-project', group: 'Actions', title: 'New project', icon: <FolderKanban />, run: add('project') },
      { id: 'v-month', group: 'Go to', title: 'View this month', sub: 'Monthly review', icon: <CalendarDays />, run: go(`/reviews/month/${month}`) },
      { id: 'v-week', group: 'Go to', title: 'View this week', sub: 'Weekly review', icon: <CalendarDays />, run: go(`/reviews/week/${boot.today}`) },
      { id: 'v-gymp', group: 'Go to', title: 'View gym progress', icon: <Dumbbell />, keywords: 'strength', run: go('/progress?tab=fitness') },
      { id: 'v-yig', group: 'Go to', title: `${year} in review`, icon: <Award />, keywords: 'wrapped year', run: go(`/wrapped/${year}`) },
      ...NAV.flatMap((g) => g.items).map<Item>((n) => ({ id: `nav-${n.to}`, group: 'Go to', title: n.label, icon: n.icon, run: go(n.to) })),
      { id: 'nav-settings', group: 'Go to', title: 'Settings', icon: <FileText />, keywords: 'backup export restore', run: go('/settings') },
      { id: 't-light', group: 'Theme', title: 'Light theme', icon: <Sun />, run: () => (setThemePref('light'), close()) },
      { id: 't-dark', group: 'Theme', title: 'Dark theme', icon: <Moon />, run: () => (setThemePref('dark'), close()) },
      { id: 't-custom', group: 'Theme', title: 'Custom theme', sub: 'Your own accent color', icon: <Palette />, keywords: 'colour color accent tiffany', run: () => (setThemePref('custom'), close()) },
    ],
    [boot.timer, boot.today],
  );

  const items: Item[] = useMemo(() => {
    const s = q.trim().toLowerCase();
    const matched = s
      ? actions.filter((a) => `${a.title} ${a.sub ?? ''} ${a.keywords ?? ''}`.toLowerCase().includes(s)).slice(0, 8)
      : actions.filter((a) => a.group === 'Actions').slice(0, 8);
    const found: Item[] =
      s.length >= 2 && results.data
        ? results.data.slice(0, 30).map((r, i) => ({
            id: `r-${i}`,
            group: 'Results',
            title: r.title,
            sub: r.subtitle,
            icon: KIND_ICON[r.kind],
            run: go(r.href),
          }))
        : [];
    return [...found.filter((f) => f.sub?.includes('Open day') || f.title.match(/^\w+ \d{4}$/)), ...matched, ...found.filter((f) => !(f.sub?.includes('Open day') || f.title.match(/^\w+ \d{4}$/)))];
  }, [q, actions, results.data]);

  useEffect(() => setActive(0), [q, results.data]);
  useEffect(() => {
    list.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const groups: [string, (Item & { idx: number })[]][] = [];
  items.forEach((it, idx) => {
    const g = groups.find(([n]) => n === it.group);
    if (g) g[1].push({ ...it, idx });
    else groups.push([it.group, [{ ...it, idx }]]);
  });

  return (
    <Dialog open={open} onClose={close} bare className="cmd" width={620}>
      <div className="cmd-input">
        <Search />
        <input
          autoFocus
          data-autofocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your life, or type a command…"
          aria-label="Search"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              items[active]?.run();
            }
          }}
        />
        {results.isFetching && <span className="faint" style={{ fontSize: 12 }}>Searching…</span>}
      </div>
      <div className="cmd-list" ref={list} role="listbox">
        {groups.map(([name, its]) => (
          <div key={name}>
            <div className="cmd-group">{name}</div>
            {its.map((it) => (
              <button key={it.id} className="cmd-item" data-idx={it.idx} data-active={it.idx === active} role="option" aria-selected={it.idx === active} onMouseMove={() => setActive(it.idx)} onClick={it.run}>
                <span className="ci-icon">{it.icon}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <div className="truncate">{it.title}</div>
                  {it.sub && <div className="ci-sub truncate">{it.sub}</div>}
                </span>
                {it.hint && <span className="ci-hint">{it.hint}</span>}
              </button>
            ))}
          </div>
        ))}
        {q.trim().length >= 2 && !items.length && !results.isFetching && (
          <div className="empty empty-sm">
            <h3>Nothing found for “{q.trim()}”</h3>
            <p>Try a month (“September”), a project, an exercise, or an amount like “$500”.</p>
          </div>
        )}
      </div>
      <div className="cmd-foot">
        <span>
          <span className="kbd">↑</span>
          <span className="kbd">↓</span> navigate
        </span>
        <span>
          <span className="kbd">↵</span> open
        </span>
        <span>
          <span className="kbd">esc</span> close
        </span>
        <span style={{ marginLeft: 'auto' }}>Try “September”, “HVAC”, “$500”, “Bench Press”</span>
      </div>
    </Dialog>
  );
}
