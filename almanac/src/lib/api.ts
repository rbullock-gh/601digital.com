import { QueryClient } from '@tanstack/react-query';
import { localDate, localTime } from '../../shared/dates.ts';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function headers(extra?: Record<string, string>): Record<string, string> {
  // The browser's clock defines "today", wherever the server runs.
  return { 'x-local-date': localDate(), 'x-local-time': localTime(), ...extra };
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('almanac:auth'));
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, msg);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const api = {
  get: <T>(url: string) => fetch(`/api${url}`, { headers: headers(), credentials: 'same-origin' }).then((r) => handle<T>(r)),
  send: <T>(method: 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown) =>
    fetch(`/api${url}`, {
      method,
      headers: headers(body !== undefined ? { 'content-type': 'application/json' } : undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    }).then((r) => handle<T>(r)),
  post: <T>(url: string, body?: unknown) => api.send<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => api.send<T>('PUT', url, body ?? {}),
  del: <T>(url: string) => api.send<T>('DELETE', url),
  upload: <T>(url: string, form: FormData) =>
    fetch(`/api${url}`, { method: 'POST', headers: headers(), body: form, credentials: 'same-origin' }).then((r) => handle<T>(r)),
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

/**
 * One entry → everything updates. Any write invalidates every cached view, so
 * the dashboard, calendar, goals, reviews and charts all recompute from the
 * server on their next render. Cheap for a single-user app, and never stale.
 */
export function refreshAll() {
  return queryClient.invalidateQueries();
}
