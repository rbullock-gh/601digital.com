// Response shapes of the summary endpoints (mirrors server/domain/*).
import type { ISODate } from '../../shared/dates.ts';
import type { DaySummary, EarningRow, GoalProgress, PhotoSet, Place, PR, Rating, ScreenDay, Totals, Visit, WorkoutSummary } from '../../shared/types.ts';

export interface Range {
  start: ISODate;
  end: ISODate;
}

export interface DayPoint {
  date: ISODate;
  minutes: number;
  cents: number;
  workouts: number;
  rating: Rating | null;
}

export interface MonthPoint {
  month: string;
  minutes: number;
  cents: number;
  workouts: number;
  gymMinutes: number;
  workDays: number;
  good: number;
  okay: number;
  bad: number;
}

export interface RatingStats {
  good: number;
  okay: number;
  bad: number;
  unrated: number;
  rated: number;
  pctGood: number | null;
  pctOkay: number | null;
  pctBad: number | null;
  currentStreak: number;
  longestStreak: { length: number; start: ISODate | null; end: ISODate | null };
  bestMonth: { month: string; good: number } | null;
}

export interface Projection {
  projectedCents: number;
  perDayCents: number;
  elapsedDays: number;
  totalDays: number;
}

export interface StrengthChange {
  id: number;
  name: string;
  startE1rm: number;
  endE1rm: number;
  change: number;
  pct: number;
}

export interface Accomplishment {
  id: number;
  date: ISODate;
  text: string;
  isMilestone: boolean;
}

export type WorkoutWithNames = WorkoutSummary & { exercises: string[] };

export interface Dashboard {
  today: {
    date: ISODate;
    minutes: number;
    earnedCents: number;
    sessions: number;
    rating: Rating | null;
    workouts: WorkoutWithNames[];
    dailyGoals: GoalProgress[];
  };
  yesterdayUnrated: boolean;
  week: { range: Range; totals: Totals; previous: Totals; goalsCompleted: number; workoutTarget: number; screen: ScreenAvg; screenPrev: ScreenAvg };
  month: {
    range: Range;
    totals: Totals;
    previous: Totals;
    weight: { current: number; change: number | null } | null;
    photo: { month: string; count: number; complete: boolean };
    projection: Projection | null;
    goals: GoalProgress[];
  };
  year: {
    range: Range;
    totals: Totals;
    ratings: RatingStats;
    goalsCompleted: number;
    strength: StrengthChange[];
    milestones: Accomplishment[];
    projection: Projection | null;
  };
  goals: GoalProgress[];
  recentPRs: PR[];
  recent: DayPoint[];
  goodStreak: number;
}

export interface YearGridData {
  year: number;
  days: DaySummary[];
  daysInYear: number;
  stats: RatingStats;
}

export interface FieldChange {
  field: string;
  from: { date: ISODate; value: number } | null;
  to: { date: ISODate; value: number } | null;
  change: number | null;
}

export interface CompletedGoal {
  id: number;
  title: string;
  metric: string;
  period: string;
  date: ISODate;
}

export interface PeriodReport {
  range: Range;
  totals: Totals;
  previous: Totals;
  ratings: RatingStats;
  days: DayPoint[];
  projects: { id: number; name: string; color: string | null; status: string; minutes: number; cents: number }[];
  completedProjects: { id: number; name: string; date: ISODate }[];
  goalsCompleted: CompletedGoal[];
  prs: PR[];
  accomplishments: Accomplishment[];
  bodyChanges: FieldChange[];
  topExercises: { id: number; name: string; sessions: number; sets: number; volumeKg: number }[];
  strength: StrengthChange[];
  avgRate: number | null;
  daysInPeriod: number;
  screen: ScreenAvg;
  screenPrev: ScreenAvg;
  travel: TravelVisit[];
  travelStats: TravelStats;
  answers: Record<string, string>;
}

export interface MonthlyReviewData extends PeriodReport {
  kind: 'month';
  month: string;
  photos: PhotoSet | null;
  previousPhotos: PhotoSet | null;
}

export interface YearReviewData extends PeriodReport {
  kind: 'year';
  year: number;
  months: MonthPoint[];
  bestMonth: MonthPoint | null;
  bestWeek: { start: ISODate; cents: number } | null;
  bestDay: { date: ISODate; cents: number } | null;
  longestDay: { date: ISODate; minutes: number } | null;
  mostTrained: { name: string; sessions: number; sets: number } | null;
  weight: FieldChange | null;
  firstPhotos: PhotoSet | null;
  lastPhotos: PhotoSet | null;
  grid: YearGridData;
  longestStreak: { length: number; start: ISODate | null; end: ISODate | null };
  screenMonths: { month: string; avg: number; logged: number }[];
  visionAchieved: { id: number; title: string | null; body: string | null; achievedOn: ISODate }[];
}

export interface MoneyBreakdown {
  range: Range;
  total: number;
  rows: EarningRow[];
  byProject: { name: string; cents: number; count: number }[];
  byKind: { kind: string; cents: number }[];
}

// ── Screen time & travel ────────────────────────────────────────────────────

export interface ScreenAvg {
  avg: number | null;
  logged: number;
  total: number;
}

export interface ScreenSummary {
  today: ScreenDay | null;
  yesterday: ScreenDay | null;
  week: ScreenAvg;
  lastWeek: ScreenAvg;
  last30: ScreenAvg;
  prev30: ScreenAvg;
  daily: { date: ISODate; minutes: number | null }[];
  weeks: { start: ISODate; avg: number | null; logged: number }[];
  byWeekday: { wd: number; avg: number | null }[];
  categories: { name: string; avg: number }[];
  pickupsAvg: number | null;
  lowest: ScreenDay | null;
  highest: ScreenDay | null;
  recent: ScreenDay[];
  categoryNames: string[];
}

export type TravelVisit = Visit & { placeName: string; region: string | null; country: string | null; lat: number; lng: number };

export interface TravelStats {
  places: number;
  countries: number;
  states: number;
  bucketList: number;
  trips: number;
  tripDays: number;
  newPlaces: string[];
  farthest: { name: string; miles: number } | null;
  home: { name: string } | null;
}

export interface TravelData {
  places: Place[];
  year: TravelStats;
  allTime: TravelStats;
}
