import { useBoot } from '../lib/boot.ts';
import { useDocumentTitle } from '../lib/hooks.ts';
import { DayDetail } from '../features/DayDetail.tsx';

export default function Today() {
  const boot = useBoot();
  useDocumentTitle('Today');
  return <DayDetail date={boot.today} isToday />;
}
