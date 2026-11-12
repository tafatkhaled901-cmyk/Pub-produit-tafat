import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { signedUploadUrl, signedUrl, supabase } from './db.js';
import { env } from './env.js';
import { LANGUAGES, TONES, type VideoJob } from './types.js';

type Vars = { Variables: { userId: string } };

export const api = new Hono<Vars>();

api.use('*', cors());
api.get('/health', (c) => c.json({ ok: true }));

// Toutes les routes ci-dessous exigent un jeton Supabase valide.
api.use('*', async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return c.json({ error: 'Connexion requise.' }, 401);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return c.json({ error: 'Session expirée.' }, 401);
  c.set('userId', data.user.id);
  await next();
});

async function credits(userId: string): Promise<number> {
  const { data } = await supabase.from('profiles').select('credits').eq('id', userId).maybeSingle();
  return data?.credits ?? 0;
}

async function ownJob(userId: string, id: string): Promise<VideoJob | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data } = await supabase
    .from('video_jobs').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  return (data as VideoJob | null) ?? null;
}

async function present(job: VideoJob) {
  const done = job.status === 'done' && job.video_path;
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    error: job.error,
    tone: job.tone,
    language: job.language,
    music: job.music,
    product_name: job.analysis?.product_name ?? null,
    hook: job.analysis?.hook ?? null,
    video_url: done ? await signedUrl(job.video_path as string) : null,
    thumb_url: done && job.thumb_path ? await signedUrl(job.thumb_path) : null,
  };
}

api.get('/me', async (c) => c.json({ credits: await credits(c.get('userId')) }));

// 1. L'app demande où déposer la photo.
api.post('/uploads', async (c) => {
  const userId = c.get('userId');
  const upload = await signedUploadUrl(`${userId}/photos/${randomUUID()}.jpg`);
  return c.json({ bucket: env.bucket, ...upload });
});

// 2. L'app lance la génération : 1 crédit, 1 job.
const createBody = z.object({
  photo_path: z.string().min(1).max(300),
  tone: z.enum(TONES),
  language: z.enum(LANGUAGES),
});

api.post('/videos', async (c) => {
  const userId = c.get('userId');
  const body = createBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Requête invalide.' }, 400);
  // Un utilisateur ne peut référencer que ses propres photos.
  if (!body.data.photo_path.startsWith(`${userId}/photos/`) || body.data.photo_path.includes('..')) {
    return c.json({ error: 'Photo introuvable.' }, 400);
  }

  const { data, error } = await supabase.rpc('create_video_job', {
    p_user: userId,
    p_photo: body.data.photo_path,
    p_tone: body.data.tone,
    p_language: body.data.language,
  });
  if (error) {
    if (error.message.includes('NO_CREDITS')) {
      return c.json({ error: 'Vous n’avez plus de crédit.', code: 'NO_CREDITS' }, 402);
    }
    console.error('[api] create_video_job', error.message);
    return c.json({ error: 'Impossible de lancer la vidéo.' }, 500);
  }
  return c.json({ id: data as string, credits: await credits(userId) }, 201);
});

// 3. Suivi (secours si le temps réel ne passe pas) et lien de la vidéo.
api.get('/videos/:id', async (c) => {
  const job = await ownJob(c.get('userId'), c.req.param('id'));
  if (!job) return c.json({ error: 'Vidéo introuvable.' }, 404);
  return c.json(await present(job));
});

// 4. Retouche gratuite : nouvelle musique ou nouveau ton, sans régénérer les clips.
const remixBody = z
  .object({ tone: z.enum(TONES).optional(), music: z.number().int().min(1).max(3).optional() })
  .refine((b) => b.tone !== undefined || b.music !== undefined);

api.post('/videos/:id/remix', async (c) => {
  const userId = c.get('userId');
  const body = remixBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Requête invalide.' }, 400);

  const job = await ownJob(userId, c.req.param('id'));
  if (!job) return c.json({ error: 'Vidéo introuvable.' }, 404);
  if (job.status !== 'done') return c.json({ error: 'La vidéo n’est pas encore prête.' }, 409);

  const rootId = job.source_job_id ?? job.id;
  const { count } = await supabase
    .from('video_jobs').select('id', { count: 'exact', head: true }).eq('source_job_id', rootId);
  if ((count ?? 0) >= env.maxRemixesPerVideo) {
    return c.json({ error: 'Nombre maximal de retouches atteint pour cette vidéo.' }, 429);
  }

  const tone = body.data.tone ?? job.tone;
  const { data, error } = await supabase
    .from('video_jobs')
    .insert({
      user_id: userId,
      kind: 'remix',
      source_job_id: rootId,
      photo_path: job.photo_path,
      tone,
      language: job.language,
      music: body.data.music ?? job.music,
      // Même ton : on garde le script. Nouveau ton : le worker réécrit les textes.
      analysis: tone === job.tone ? job.analysis : null,
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('[api] remix', error?.message);
    return c.json({ error: 'Impossible de lancer la retouche.' }, 500);
  }
  return c.json({ id: data.id as string }, 201);
});

api.onError((err, c) => {
  console.error('[api]', err);
  return c.json({ error: 'Erreur du serveur.' }, 500);
});
