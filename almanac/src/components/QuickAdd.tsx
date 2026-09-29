import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Camera, ChevronLeft, DollarSign, Dumbbell, FolderKanban, MapPin, Play, Ruler, Scale, Smartphone, Sparkles, SquarePen, StickyNote, Target, Trophy, Square } from 'lucide-react';
import { useUI, type AddKind } from '../lib/ui.tsx';
import { useBoot } from '../lib/boot.ts';
import { api } from '../lib/api.ts';
import { Dialog } from './ui/Dialog.tsx';
import { BodyForm, DayEntryForm, GoalForm, IncomeForm, NoteForm, ProjectForm, WinForm, WorkSessionForm } from '../features/forms.tsx';
import { useTimerActions } from './Timer.tsx';
import { ScreenTimeForm, TripForm, VisionForm } from '../features/lifeForms.tsx';
import type { DayView } from '../../shared/types.ts';
import type { ISODate } from '../../shared/dates.ts';

const TITLES: Partial<Record<AddKind, string>> = {
  work: 'Log work session',
  income: 'Add income',
  weight: 'Log weight',
  body: 'Body measurements',
  day: 'How was today?',
  goal: 'New goal',
  note: 'Quick note',
  win: 'Add a win',
  project: 'New project',
  screen: 'Log screen time',
  trip: 'Add a trip',
  vision: 'Add to vision board',
};

/** The universal Add: every kind of entry, two taps away. */
export function QuickAdd() {
  const ui = useUI();
  const boot = useBoot();
  const navigate = useNavigate();
  const timer = useTimerActions();
  const kind = ui.add?.kind;
  const preset = ui.add?.preset ?? {};
  const dayDate = (preset.date as ISODate | undefined) ?? boot.today;
  const day = useQuery({ queryKey: ['day', dayDate], queryFn: () => api.get<DayView>(`/days/${dayDate}`), enabled: kind === 'day' });

  const go = (k: AddKind) => ui.openAdd(k, preset);
  const close = ui.closeAdd;

  const tiles: { k: AddKind | 'timer' | 'workout' | 'photos'; name: string; sub: string; icon: React.ReactNode; tone: string }[] = [
    boot.timer
      ? { k: 'timer', name: 'Stop work', sub: 'Log the running timer', icon: <Square />, tone: 'work' }
      : { k: 'timer', name: 'Start work', sub: 'Begin the timer', icon: <Play />, tone: 'work' },
    { k: 'work', name: 'Work session', sub: 'Hours on a project', icon: <Briefcase />, tone: 'work' },
    { k: 'income', name: 'Income', sub: 'Payments & other', icon: <DollarSign />, tone: 'money' },
    { k: 'workout', name: 'Workout', sub: 'Sets, reps, weight', icon: <Dumbbell />, tone: 'fitness' },
    { k: 'weight', name: 'Weight', sub: 'Morning weigh-in', icon: <Scale />, tone: 'body' },
    { k: 'body', name: 'Measurements', sub: 'Waist, chest, arms…', icon: <Ruler />, tone: 'body' },
    { k: 'photos', name: 'Progress photos', sub: 'Front, side, back', icon: <Camera />, tone: 'body' },
    { k: 'day', name: 'Rate today', sub: 'Good, okay, or bad', icon: <SquarePen />, tone: '' },
    { k: 'win', name: 'Win', sub: 'Accomplishment', icon: <Trophy />, tone: '' },
    { k: 'note', name: 'Note', sub: 'A quick thought', icon: <StickyNote />, tone: '' },
    { k: 'screen', name: 'Screen time', sub: 'From your phone', icon: <Smartphone />, tone: 'screen' },
    { k: 'trip', name: 'Trip', sub: 'Pin it on the map', icon: <MapPin />, tone: 'travel' },
    { k: 'goal', name: 'Goal', sub: 'Tracks itself', icon: <Target />, tone: '' },
    { k: 'vision', name: 'Vision', sub: 'Image or words', icon: <Sparkles />, tone: '' },
    { k: 'project', name: 'Project', sub: 'For work & income', icon: <FolderKanban />, tone: '' },
  ];

  const onTile = (k: (typeof tiles)[number]['k']) => {
    if (k === 'timer') {
      close();
      if (boot.timer) timer.stop();
      else timer.start();
    } else if (k === 'workout') {
      close();
      navigate(`/gym/new${preset.date ? `?date=${preset.date}` : ''}`);
    } else if (k === 'photos') {
      close();
      navigate(`/photos/${boot.today.slice(0, 7)}?add=1`);
    } else go(k);
  };

  const back =
    kind && kind !== 'menu' && !preset.direct ? (
      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => go('menu')} aria-label="Back">
        <ChevronLeft />
      </button>
    ) : null;

  const title =
    kind === 'menu' ? (
      'Add'
    ) : (
      <span className="row" style={{ gap: 6 }}>
        {back}
        {kind === 'day' && dayDate !== boot.today ? 'How was the day?' : TITLES[kind as AddKind]}
      </span>
    );

  return (
    <Dialog open={!!ui.add} onClose={close} title={title} width={kind === 'menu' ? 560 : kind === 'goal' || kind === 'vision' ? 580 : 520}>
      {kind === 'menu' && (
        <div className="qa-grid">
          {tiles.map((t, i) => (
            <button key={t.name} className={`qa-tile ${t.tone}`} onClick={() => onTile(t.k)} style={{ animationDelay: `${i * 18}ms` }} {...(i === 0 ? { 'data-autofocus': true } : {})}>
              <span className="icon-tile">{t.icon}</span>
              <span>
                <div className="qa-name">{t.name}</div>
                <div className="qa-sub">{t.sub}</div>
              </span>
            </button>
          ))}
        </div>
      )}
      {kind === 'work' && <WorkSessionForm preset={preset} onDone={close} />}
      {kind === 'income' && <IncomeForm preset={preset} onDone={close} />}
      {kind === 'weight' && <BodyForm weightOnly preset={preset} onDone={close} />}
      {kind === 'body' && <BodyForm preset={preset} onDone={close} />}
      {kind === 'note' && <NoteForm preset={preset} onDone={close} />}
      {kind === 'win' && <WinForm preset={preset} onDone={close} />}
      {kind === 'goal' && <GoalForm onDone={close} />}
      {kind === 'project' && <ProjectForm onDone={close} />}
      {kind === 'screen' && <ScreenTimeForm preset={preset} onDone={close} />}
      {kind === 'trip' && <TripForm preset={preset} onDone={close} />}
      {kind === 'vision' && <VisionForm onDone={close} />}
      {kind === 'day' && day.data && <DayEntryForm date={dayDate} initialRating={day.data.rating} initialJournal={day.data.journal} onDone={close} />}
    </Dialog>
  );
}
