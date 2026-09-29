import { Navigate, useParams } from 'react-router-dom';
import { useBoot } from '../lib/boot.ts';
import { useDocumentTitle } from '../lib/hooks.ts';
import { longDate } from '../lib/format.ts';
import { DayDetail } from '../features/DayDetail.tsx';
import { isISODate } from '../../shared/dates.ts';

export default function DayPage() {
  const { date = '' } = useParams();
  const boot = useBoot();
  useDocumentTitle(isISODate(date) ? longDate(date, true) : 'Day');
  if (!isISODate(date)) return <Navigate to="/today" replace />;
  return <DayDetail key={date} date={date} isToday={date === boot.today} />;
}
