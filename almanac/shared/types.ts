// API contract shared by server and client.
import type { ISODate, YearMonth } from './dates.ts';

export type Rating = 1 | 2 | 3; // bad · okay · good
export type WeightUnit = 'lb' | 'kg';
export type LengthUnit = 'in' | 'cm';

export interface Settings {
  name: string;
  defaultRateCents: number;
  currency: string;
  weekStart: 0 | 1;
  dateFormat: 'MDY' | 'DMY' | 'YMD';
  timeFormat: '12' | '24';
  weightUnit: WeightUnit;
  lengthUnit: LengthUnit;
  photoDay: number;
  photoSnoozeUntil: ISODate | null;
  photoDismissedMonth: YearMonth | null;
  onboarded: boolean;
  weeklyWorkoutTarget: number;
}

export interface Timer {
  startedAt: string; // ISO timestamp
  pausedAt: string | null;
  breakMs: number;
  projectId: number | null;
  categoryId: number | null;
  description: string;
  date: ISODate; // local date the timer started
  startClock: string; // local 'HH:MM' it started
}

export interface Project {
  id: number;
  name: string;
  client: string | null;
  status: 'active' | 'paused' | 'completed' | 'archived';
  color: string | null;
  hourlyRateCents: number | null;
  notes: string | null;
  completedOn: ISODate | null;
  createdAt: string;
}

export interface ProjectSummary extends Project {
  minutes: number;
  earnedCents: number;
  sessions: number;
  firstActivity: ISODate | null;
  lastActivity: ISODate | null;
}

export interface Category {
  id: number;
  name: string;
  uses: number;
}

export interface Exercise {
  id: number;
  name: string;
  muscleGroup: string | null;
  kind: 'weighted' | 'bodyweight';
  uses: number;
  lastDate: ISODate | null;
}

export interface Bootstrap {
  mode: 'real' | 'sample';
  hasRealData: boolean;
  settings: Settings;
  timer: Timer | null;
  today: ISODate;
  projects: Project[];
  categories: Category[];
  exercises: Exercise[];
  version: string;
  passcode: boolean;
}

export interface WorkSession {
  id: number;
  date: ISODate;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
  minutes: number;
  projectId: number | null;
  projectName: string | null;
  projectColor: string | null;
  categoryId: number | null;
  categoryName: string | null;
  description: string | null;
  payType: 'hourly' | 'flat' | 'unpaid';
  hourlyRateCents: number | null;
  flatAmountCents: number | null;
  earnedCents: number;
  notes: string | null;
}

export interface WorkSessionInput {
  date: ISODate;
  startTime?: string | null;
  endTime?: string | null;
  breakMinutes?: number;
  minutes?: number | null;
  projectId?: number | null;
  projectName?: string | null; // creates the project if new
  categoryId?: number | null;
  categoryName?: string | null;
  description?: string | null;
  payType: 'hourly' | 'flat' | 'unpaid';
  hourlyRateCents?: number | null;
  flatAmountCents?: number | null;
  notes?: string | null;
}

export interface Income {
  id: number;
  date: ISODate;
  amountCents: number;
  source: string;
  kind: 'flat' | 'project' | 'other';
  projectId: number | null;
  projectName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  notes: string | null;
}

export interface IncomeInput {
  date: ISODate;
  amountCents: number;
  source: string;
  kind: 'flat' | 'project' | 'other';
  projectId?: number | null;
  projectName?: string | null;
  categoryId?: number | null;
  categoryName?: string | null;
  notes?: string | null;
}

export interface EarningRow {
  source: 'session' | 'income';
  id: number;
  date: ISODate;
  cents: number;
  kind: 'hourly' | 'flat' | 'project' | 'other';
  label: string;
  minutes: number;
  projectId: number | null;
  projectName: string | null;
  categoryName: string | null;
}

export interface Totals {
  minutes: number;
  earnedCents: number;
  sessions: number;
  workDays: number;
  workouts: number;
  gymMinutes: number;
  good: number;
  okay: number;
  bad: number;
  rated: number;
  prs: number;
}

export interface WorkoutSet {
  id?: number;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  isWarmup: boolean;
}

export interface WorkoutExercise {
  id?: number;
  exerciseId: number;
  exerciseName: string;
  notes: string | null;
  sets: WorkoutSet[];
}

export interface Workout {
  id: number;
  date: ISODate;
  name: string;
  startTime: string | null;
  durationMinutes: number | null;
  notes: string | null;
  exercises: WorkoutExercise[];
  prs: PR[];
}

export interface WorkoutSummary {
  id: number;
  date: ISODate;
  name: string;
  durationMinutes: number | null;
  exerciseCount: number;
  setCount: number;
  volumeKg: number;
  prCount: number;
}

export interface WorkoutInput {
  date: ISODate;
  name: string;
  startTime?: string | null;
  durationMinutes?: number | null;
  notes?: string | null;
  exercises: {
    exerciseId?: number | null;
    exerciseName: string;
    notes?: string | null;
    sets: { weightKg: number | null; reps: number | null; rpe?: number | null; isWarmup?: boolean }[];
  }[];
}

export type PRType = 'weight' | 'e1rm' | 'reps';

export interface PR {
  id: number;
  exerciseId: number;
  exerciseName: string;
  workoutId: number;
  date: ISODate;
  type: PRType;
  weightKg: number | null;
  reps: number | null;
  value: number;
  previousValue: number | null;
}

export interface BodyMetric {
  id: number;
  date: ISODate;
  weightKg: number | null;
  waistCm: number | null;
  chestCm: number | null;
  armsCm: number | null;
  forearmsCm: number | null;
  shouldersCm: number | null;
  thighsCm: number | null;
  calvesCm: number | null;
  neckCm: number | null;
  bodyFatPct: number | null;
  notes: string | null;
}

export const MEASUREMENTS = [
  'waistCm', 'chestCm', 'armsCm', 'forearmsCm', 'shouldersCm', 'thighsCm', 'calvesCm', 'neckCm',
] as const;
export type MeasurementKey = (typeof MEASUREMENTS)[number];
export const MEASUREMENT_LABELS: Record<MeasurementKey, string> = {
  waistCm: 'Waist',
  chestCm: 'Chest',
  armsCm: 'Arms',
  forearmsCm: 'Forearms',
  shouldersCm: 'Shoulders',
  thighsCm: 'Thighs',
  calvesCm: 'Calves',
  neckCm: 'Neck',
};

export type Angle = 'front' | 'side' | 'back' | 'other';

export interface Photo {
  id: number;
  angle: Angle;
  url: string;
  thumbUrl: string;
  width: number | null;
  height: number | null;
}

export interface PhotoSet {
  id: number;
  month: YearMonth;
  date: ISODate;
  note: string | null;
  photos: Photo[];
  complete: boolean;
  weightKg: number | null;
}

export type GoalMetric =
  | 'earnings'
  | 'hours'
  | 'workouts'
  | 'work_days'
  | 'good_days'
  | 'gym_hours'
  | 'prs'
  | 'projects_completed'
  | 'photos'
  | 'weight'
  | 'waist'
  | 'exercise_weight'
  | 'exercise_e1rm'
  | 'manual';

export type GoalPeriod = 'day' | 'week' | 'month' | 'year' | 'custom' | 'target';

export interface Goal {
  id: number;
  title: string;
  metric: GoalMetric;
  period: GoalPeriod;
  recurring: boolean;
  startDate: ISODate | null;
  endDate: ISODate | null;
  target: number;
  baseline: number | null;
  exerciseId: number | null;
  exerciseName: string | null;
  projectId: number | null;
  projectName: string | null;
  status: 'active' | 'archived';
}

export interface GoalProgress extends Goal {
  current: number;
  pct: number; // 0..1
  done: boolean;
  periodStart: ISODate | null;
  periodEnd: ISODate | null;
  /** For recurring goals: completed / elapsed instances since creation. */
  streak?: number;
  history?: { start: ISODate; done: boolean }[];
  completedOn?: ISODate | null;
  checkedToday?: boolean;
}

export interface GoalInput {
  title: string;
  metric: GoalMetric;
  period: GoalPeriod;
  recurring?: boolean;
  startDate?: ISODate | null;
  endDate?: ISODate | null;
  target: number;
  exerciseId?: number | null;
  projectId?: number | null;
}

export interface Note {
  id: number;
  date: ISODate;
  time: string | null;
  body: string;
}

export interface Accomplishment {
  id: number;
  date: ISODate;
  text: string;
  isMilestone: boolean;
}

export interface DaySummary {
  date: ISODate;
  rating: Rating | null;
  minutes: number;
  earnedCents: number;
  workout: { name: string; durationMinutes: number | null } | null;
  workoutCount: number;
  prs: number;
  goalsDone: number;
  goalsTotal: number;
  hasJournal: boolean;
  hasBody: boolean;
  hasPhotos: boolean;
  noteCount: number;
}

export interface DayView {
  date: ISODate;
  rating: Rating | null;
  journal: string | null;
  sessions: WorkSession[];
  income: Income[];
  minutes: number;
  earnedCents: number;
  workouts: (WorkoutSummary & { exercises: string[] })[];
  prs: PR[];
  body: BodyMetric[];
  photoSet: PhotoSet | null;
  notes: Note[];
  accomplishments: Accomplishment[];
  goals: GoalProgress[];
  prev: ISODate;
  next: ISODate;
}

export interface Insight {
  id: string;
  domain: 'work' | 'money' | 'fitness' | 'body' | 'life' | 'links';
  text: string;
  detail?: string;
  /** Correlations are labelled so they are never read as causes. */
  correlation?: boolean;
  weight: number;
}

export interface SearchResult {
  kind: 'page' | 'action' | 'day' | 'month' | 'session' | 'income' | 'project' | 'exercise' | 'workout' | 'note' | 'journal' | 'accomplishment' | 'goal';
  title: string;
  subtitle?: string;
  href: string;
  date?: ISODate;
}
