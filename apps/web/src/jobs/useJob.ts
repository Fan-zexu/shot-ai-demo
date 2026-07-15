import { useCallback, useEffect, useState } from 'react';

import type { JobSummary } from '@shot-ai/contracts';

import { getJob, toApiError } from '../lib/api.ts';
import type { PublicApiError } from '../lib/types.ts';

const TERMINAL = new Set<JobSummary['status']>(['ready', 'rejected', 'failed']);

export function useJob(jobId: string) {
  const [job, setJob] = useState<JobSummary | null>(null);
  const [error, setError] = useState<PublicApiError | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const nextJob = await getJob(jobId);
        if (cancelled) return;
        setJob(nextJob);
        setError(null);
        if (!TERMINAL.has(nextJob.status)) {
          timer = window.setTimeout(poll, document.hidden ? 5_000 : 1_000);
        }
      } catch (nextError) {
        if (cancelled) return;
        setError(toApiError(nextError));
        timer = window.setTimeout(poll, document.hidden ? 5_000 : 1_000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [jobId, refreshToken]);

  return { job, error, refresh };
}
