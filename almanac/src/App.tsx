import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './lib/api.ts';
import { useBootQuery } from './lib/boot.ts';
import { UIProvider } from './lib/ui.tsx';
import { TooltipProvider } from './components/ui/Tooltip.tsx';
import { PageSkeleton } from './components/ui/primitives.tsx';
import { Shell } from './components/Shell.tsx';
import { Onboarding, PasscodeScreen } from './pages/Onboarding.tsx';

const Dashboard = lazy(() => import('./pages/Dashboard.tsx'));
const Today = lazy(() => import('./pages/Today.tsx'));
const DayPage = lazy(() => import('./pages/DayPage.tsx'));
const Work = lazy(() => import('./pages/Work.tsx'));
const Money = lazy(() => import('./pages/Money.tsx'));
const Projects = lazy(() => import('./pages/Projects.tsx'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail.tsx'));
const Gym = lazy(() => import('./pages/Gym.tsx'));
const WorkoutEditor = lazy(() => import('./pages/WorkoutEditor.tsx'));
const ExercisePage = lazy(() => import('./pages/ExercisePage.tsx'));
const PRHistory = lazy(() => import('./pages/PRHistory.tsx'));
const Body = lazy(() => import('./pages/Body.tsx'));
const Photos = lazy(() => import('./pages/Photos.tsx'));
const PhotoMonth = lazy(() => import('./pages/PhotoMonth.tsx'));
const PhotoCompare = lazy(() => import('./pages/PhotoCompare.tsx'));
const Calendar = lazy(() => import('./pages/Calendar.tsx'));
const Goals = lazy(() => import('./pages/Goals.tsx'));
const Progress = lazy(() => import('./pages/Progress.tsx'));
const Insights = lazy(() => import('./pages/Insights.tsx'));
const YearPage = lazy(() => import('./pages/YearPage.tsx'));
const Reviews = lazy(() => import('./pages/Reviews.tsx'));
const WeeklyReview = lazy(() => import('./pages/WeeklyReview.tsx'));
const MonthlyReview = lazy(() => import('./pages/MonthlyReview.tsx'));
const YearInReview = lazy(() => import('./pages/YearInReview.tsx'));
const Settings = lazy(() => import('./pages/Settings.tsx'));

function Splash() {
  return (
    <div className="center-screen" aria-busy="true">
      <div className="brand" style={{ opacity: 0.6, animation: 'fade-in 600ms 200ms backwards' }}>
        <span className="brand-name">Almanac</span>
      </div>
    </div>
  );
}

export function App() {
  const [authTick, setAuthTick] = useState(0);
  const auth = useQuery({
    queryKey: ['auth', authTick],
    queryFn: () => api.get<{ required: boolean; ok: boolean }>('/auth'),
    staleTime: Infinity,
  });
  useEffect(() => {
    const on = () => setAuthTick((t) => t + 1);
    window.addEventListener('almanac:auth', on);
    return () => window.removeEventListener('almanac:auth', on);
  }, []);

  const boot = useBootQuery();

  if (auth.data && auth.data.required && !auth.data.ok) return <PasscodeScreen onDone={() => setAuthTick((t) => t + 1)} />;
  if (boot.isError)
    return (
      <div className="center-screen">
        <div className="onboard">
          <h1>Almanac can’t reach its server.</h1>
          <p className="lede">Make sure it’s running (<code>npm start</code> in the almanac folder), then try again.</p>
          <button className="btn btn-primary mt-24" onClick={() => boot.refetch()}>
            Try again
          </button>
        </div>
      </div>
    );
  if (!boot.data) return <Splash />;

  const b = boot.data;
  return (
    <UIProvider>
      <TooltipProvider>
        {b.mode === 'real' && !b.settings.onboarded && !b.hasRealData ? (
          <Onboarding />
        ) : (
          <Shell>
            <Suspense fallback={<PageSkeleton />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/today" element={<Today />} />
                <Route path="/day/:date" element={<DayPage />} />
                <Route path="/work" element={<Work />} />
                <Route path="/money" element={<Money />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/gym" element={<Gym />} />
                <Route path="/gym/new" element={<WorkoutEditor />} />
                <Route path="/gym/workouts/:id" element={<WorkoutEditor />} />
                <Route path="/gym/exercises/:id" element={<ExercisePage />} />
                <Route path="/gym/prs" element={<PRHistory />} />
                <Route path="/body" element={<Body />} />
                <Route path="/photos" element={<Photos />} />
                <Route path="/photos/compare" element={<PhotoCompare />} />
                <Route path="/photos/:month" element={<PhotoMonth />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/goals" element={<Goals />} />
                <Route path="/progress" element={<Progress />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/year" element={<YearPage />} />
                <Route path="/year/:year" element={<YearPage />} />
                <Route path="/reviews" element={<Reviews />} />
                <Route path="/reviews/week/:date" element={<WeeklyReview />} />
                <Route path="/reviews/month/:month" element={<MonthlyReview />} />
                <Route path="/wrapped/:year" element={<YearInReview />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </Shell>
        )}
      </TooltipProvider>
    </UIProvider>
  );
}
