import { useQuery } from '@tanstack/react-query';
import { api } from './api.ts';
import { setFormatSettings } from './format.ts';
import type { Bootstrap } from '../../shared/types.ts';

export function useBootQuery() {
  return useQuery({
    queryKey: ['bootstrap'],
    queryFn: async () => {
      const b = await api.get<Bootstrap>('/bootstrap');
      setFormatSettings(b.settings);
      return b;
    },
    staleTime: 60_000,
  });
}

/** Bootstrap data — always loaded by the time any page renders. */
export function useBoot(): Bootstrap {
  const q = useBootQuery();
  if (!q.data) throw new Error('Bootstrap not loaded');
  return q.data;
}

export const useSettings = () => useBoot().settings;
export const useToday = () => useBoot().today;
