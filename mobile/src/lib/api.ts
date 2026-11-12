import { File } from 'expo-file-system';
import { config } from './config';
import { ensureSession, supabase } from './supabase';

export type Tone = 'dynamique' | 'professionnel' | 'humoristique';
export type Language = 'fr' | 'es';
export type JobStatus = 'queued' | 'analyzing' | 'clips' | 'editing' | 'done' | 'failed';

export interface JobView {
  id: string;
  kind: 'full' | 'remix';
  status: JobStatus;
  error: string | null;
  tone: Tone;
  language: Language;
  music: number;
  product_name: string | null;
  hook: string | null;
  video_url: string | null;
  thumb_url: string | null;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await ensureSession();
  const response = await fetch(`${config.apiUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!response.ok) throw new ApiError(json.error ?? 'Erreur du serveur.', response.status, json.code);
  return json as T;
}

export const api = {
  me: () => call<{ credits: number }>('/me'),

  /** Envoie la photo dans le stockage et renvoie son chemin. */
  async uploadPhoto(localUri: string): Promise<string> {
    const target = await call<{ bucket: string; path: string; token: string }>('/uploads', { method: 'POST' });
    const bytes = await new File(localUri).arrayBuffer();
    const { error } = await supabase.storage
      .from(target.bucket)
      .uploadToSignedUrl(target.path, target.token, bytes, { contentType: 'image/jpeg' });
    if (error) throw new Error(error.message);
    return target.path;
  },

  createVideo: (photo_path: string, tone: Tone, language: Language) =>
    call<{ id: string; credits: number }>('/videos', { method: 'POST', body: { photo_path, tone, language } }),

  getVideo: (id: string) => call<JobView>(`/videos/${id}`),

  remix: (id: string, change: { tone?: Tone; music?: number }) =>
    call<{ id: string }>(`/videos/${id}/remix`, { method: 'POST', body: change }),
};
