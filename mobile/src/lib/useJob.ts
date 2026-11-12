import { useEffect, useState } from 'react';
import { api, type JobView } from './api';
import { supabase } from './supabase';

/**
 * Suit un job : mise à jour en temps réel (Supabase Realtime), avec une
 * interrogation toutes les 4 secondes en secours si le temps réel ne passe pas.
 */
export function useJob(jobId: string | null): JobView | null {
  const [job, setJob] = useState<JobView | null>(null);

  useEffect(() => {
    setJob(null);
    if (!jobId) return;

    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const refresh = async () => {
      try {
        const next = await api.getVideo(jobId);
        if (stopped) return;
        setJob(next);
        if (next.status === 'done' || next.status === 'failed') stopPolling();
      } catch {
        // Réseau instable : on réessaiera au prochain passage.
      }
    };

    void refresh();
    timer = setInterval(() => void refresh(), 4000);

    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'video_jobs', filter: `id=eq.${jobId}` },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      stopped = true;
      stopPolling();
      void supabase.removeChannel(channel);
    };
  }, [jobId]);

  return job;
}
