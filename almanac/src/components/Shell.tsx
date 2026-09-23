import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BookMarked,
  Briefcase,
  CalendarDays,
  Camera,
  Dumbbell,
  FolderKanban,
  Grid3x3,
  LayoutDashboard,
  Lightbulb,
  Menu,
  Plus,
  Ruler,
  Search,
  Settings as SettingsIcon,
  Star,
  Sun,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useBoot } from '../lib/boot.ts';
import { useUI } from '../lib/ui.tsx';
import { api, refreshAll } from '../lib/api.ts';
import { useIsMobile } from '../lib/hooks.ts';
import { Dialog } from './ui/Dialog.tsx';
import { ThemeToggle } from './ThemeToggle.tsx';
import { TimerCard, TimerPill, StopTimerDialog } from './Timer.tsx';
import { QuickAdd } from './QuickAdd.tsx';
import { CommandPalette } from './CommandPalette.tsx';
import { BrandMark } from './BrandMark.tsx';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

export const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: '',
    items: [
      { to: '/', label: 'Dashboard', icon: <LayoutDashboard />, end: true },
      { to: '/today', label: 'Today', icon: <Sun /> },
    ],
  },
  {
    label: 'Work',
    items: [
      { to: '/work', label: 'Work', icon: <Briefcase /> },
      { to: '/money', label: 'Money', icon: <Wallet /> },
      { to: '/projects', label: 'Projects', icon: <FolderKanban /> },
    ],
  },
  {
    label: 'Fitness',
    items: [
      { to: '/gym', label: 'Gym', icon: <Dumbbell /> },
      { to: '/body', label: 'Body', icon: <Ruler /> },
      { to: '/photos', label: 'Progress Photos', icon: <Camera /> },
    ],
  },
  {
    label: 'Life',
    items: [
      { to: '/calendar', label: 'Calendar', icon: <CalendarDays /> },
      { to: '/year', label: 'Year at a Glance', icon: <Grid3x3 /> },
      { to: '/goals', label: 'Goals', icon: <Target /> },
      { to: '/progress', label: 'Progress', icon: <TrendingUp /> },
      { to: '/insights', label: 'Insights', icon: <Lightbulb /> },
    ],
  },
  {
    label: 'Reviews',
    items: [
      { to: '/reviews', label: 'Reviews', icon: <BookMarked /> },
      { to: '/wrapped/' + new Date().getFullYear(), label: 'Year in Review', icon: <Star /> },
    ],
  },
];

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export function Shell({ children }: { children: ReactNode }) {
  const boot = useBoot();
  const ui = useUI();
  const loc = useLocation();
  const navigate = useNavigate();
  const mobile = useIsMobile();
  const [moreOpen, setMoreOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Global shortcuts.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ui.setCmdOpen(!ui.cmdOpen);
        return;
      }
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.dialog-scrim:not(.closing)')) return;
      if (e.key === '/') {
        e.preventDefault();
        ui.setCmdOpen(true);
      } else if (e.key === 'n' || e.key === 'a') {
        e.preventDefault();
        ui.openAdd('menu');
      } else if (e.key === 't') navigate('/today');
      else if (e.key === 'd') navigate('/');
      else if (e.key === 'c') navigate('/calendar');
      else if (e.key === 'y') navigate('/year');
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [ui, navigate]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    setMoreOpen(false);
  }, [loc.pathname]);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  const currentTitle = NAV.flatMap((g) => g.items).find((i) => (i.end ? loc.pathname === i.to : loc.pathname.startsWith(i.to.split('/').slice(0, 2).join('/'))))?.label;

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main navigation">
        <Link to="/" className="brand" aria-label="Almanac home">
          <BrandMark />
          <span className="brand-name">Almanac</span>
        </Link>
        <button className="add-btn" onClick={() => ui.openAdd('menu')}>
          <Plus /> Add
          <span className="kbd">N</span>
        </button>
        <button className="search-btn" onClick={() => ui.setCmdOpen(true)}>
          <Search /> Search or jump to…
          <span className="kbd">⌘K</span>
        </button>
        <nav className="nav">
          {NAV.map((g, i) => (
            <div className="nav-group" key={i}>
              {g.label && <div className="nav-label">{g.label}</div>}
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `nav-link ${isActive || (it.to.startsWith('/wrapped') && loc.pathname.startsWith('/wrapped')) ? 'active' : ''}`}>
                  {it.icon}
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <TimerCard />
          <div className="row">
            <ThemeToggle />
            <span className="spacer" />
            <NavLink to="/settings" className={({ isActive }) => `btn btn-ghost btn-icon btn-sm ${isActive ? 'active' : ''}`} aria-label="Settings" title="Settings">
              <SettingsIcon />
            </NavLink>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
          <Link to="/" className="row" aria-label="Almanac home" style={{ gap: 8 }}>
            <BrandMark small />
            <span className="brand-name">{loc.pathname === '/' ? 'Almanac' : currentTitle ?? 'Almanac'}</span>
          </Link>
          <div className="actions">
            <button className="btn btn-ghost btn-icon" aria-label="Search" onClick={() => ui.setCmdOpen(true)}>
              <Search />
            </button>
            <ThemeToggle compact />
          </div>
        </header>

        {boot.mode === 'sample' && <SampleBanner />}

        <main id="main">{children}</main>
      </div>

      {mobile && (
        <>
          <TimerPill />
          <nav className="tabbar" aria-label="Quick navigation">
            <NavLink to="/" end className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
              <LayoutDashboard />
              Home
            </NavLink>
            <NavLink to="/today" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
              <Sun />
              Today
            </NavLink>
            <button className="tab-add" aria-label="Add" onClick={() => ui.openAdd('menu')}>
              <Plus />
            </button>
            <NavLink to="/gym" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
              <Dumbbell />
              Gym
            </NavLink>
            <button className={`tab ${moreOpen ? 'active' : ''}`} onClick={() => setMoreOpen(true)}>
              <Menu />
              More
            </button>
          </nav>
          <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="Almanac">
            <div className="more-grid">
              {NAV.flatMap((g) => g.items)
                .filter((i) => i.to !== '/' && i.to !== '/today')
                .map((it) => (
                  <NavLink key={it.to} to={it.to} className={({ isActive }) => `more-item ${isActive ? 'active' : ''}`}>
                    {it.icon}
                    <span>{it.label}</span>
                  </NavLink>
                ))}
              <NavLink to="/settings" className={({ isActive }) => `more-item ${isActive ? 'active' : ''}`}>
                <SettingsIcon />
                <span>Settings</span>
              </NavLink>
            </div>
          </Dialog>
        </>
      )}

      <QuickAdd />
      <CommandPalette />
      <StopTimerDialog />
    </div>
  );
}

function SampleBanner() {
  const ui = useUI();
  const boot = useBoot();
  const [busy, setBusy] = useState(false);
  const act = async () => {
    const ok = await ui.confirm({
      title: 'Delete sample data & start fresh?',
      body: boot.hasRealData
        ? 'The sample dataset will be erased and you’ll return to your own data. Your real history is stored separately and isn’t touched.'
        : 'The sample dataset will be erased and Almanac will start empty, ready for your real history. Sample data is stored separately, so nothing will ever mix.',
      confirm: 'Delete sample data',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.del('/data/sample');
      await refreshAll();
      ui.toast('Sample data deleted. This is your real Almanac.', { tone: 'success' });
    } catch (e) {
      ui.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="banner" role="status">
      <span className="badge badge-sample">Sample data</span>
      <span className="grow truncate">
        You’re exploring <b>sample data</b>. Nothing here is real, and it never mixes with your history.
      </span>
      <button className="btn btn-secondary btn-sm" onClick={act} disabled={busy}>
        <span className="hide-mobile">Delete sample data & start fresh</span>
        <span className="show-mobile">Start fresh</span>
      </button>
    </div>
  );
}
