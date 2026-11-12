import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { downloadTo, exists, signedUrl, supabase, uploadFrom } from './db.js';
import { env } from './env.js';
import { analyzeProduct } from './pipeline/analyze.js';
import { generateClip } from './pipeline/clips.js';
import { frameTo916 } from './pipeline/frame.js';
import { montage } from './pipeline/montage.js';
import { UserFacingError, type Analysis, type JobStatus, type VideoJob } from './types.js';

const GENERIC_ERROR = 'La génération a échoué. Votre crédit a été rendu, vous pouvez réessayer.';

async function setStatus(jobId: string, status: JobStatus, extra: Record<string, unknown> = {}): Promise<void> {
  const { error } = await supabase.from('video_jobs').update({ status, ...extra }).eq('id', jobId);
  if (error) throw new Error(`Mise à jour du job impossible : ${error.message}`);
}

/** Les clips et l'image cadrée appartiennent au job d'origine ; une retouche les réutilise. */
function sharedDir(job: VideoJob): string {
  return `${job.user_id}/jobs/${job.source_job_id ?? job.id}`;
}

async function runJob(job: VideoJob): Promise<void> {
  const work = await mkdtemp(path.join(os.tmpdir(), 'pub-'));
  try {
    const shared = sharedDir(job);
    const framed = path.join(work, 'framed.jpg');
    const clip1 = path.join(work, 'clip1.mp4');
    const clip2 = path.join(work, 'clip2.mp4');

    // 1. Image cadrée en 9:16 (réutilisée si elle existe déjà).
    if (await exists(`${shared}/framed.jpg`)) {
      await downloadTo(`${shared}/framed.jpg`, framed);
    } else {
      const photo = path.join(work, 'photo');
      await downloadTo(job.photo_path, photo);
      await frameTo916(photo, framed).catch(() => {
        throw new UserFacingError('Cette image est illisible. Essayez avec une autre photo.');
      });
      await uploadFrom(framed, `${shared}/framed.jpg`, 'image/jpeg');
    }

    // 2. Analyse + script. Une retouche qui garde le même ton réutilise le script.
    let analysis: Analysis | null = job.analysis;
    if (!analysis) {
      analysis = await analyzeProduct(framed, job.tone, job.language);
      if (!analysis.usable) {
        throw new UserFacingError(
          analysis.reject_reason || 'Cette photo ne permet pas de créer une publicité. Essayez avec une autre.',
        );
      }
      await setStatus(job.id, 'clips', { analysis });
    } else {
      await setStatus(job.id, 'clips');
    }

    // 3. Clips IA : générés une seule fois par photo, en parallèle.
    const clipPaths = [`${shared}/clip1.mp4`, `${shared}/clip2.mp4`] as const;
    const [has1, has2] = await Promise.all(clipPaths.map((p) => exists(p)));
    if (has1 && has2) {
      await Promise.all([downloadTo(clipPaths[0], clip1), downloadTo(clipPaths[1], clip2)]);
    } else {
      if (job.kind === 'remix') throw new Error('Clips du job source introuvables.');
      const imageUrl = await signedUrl(`${shared}/framed.jpg`, 3600);
      const prompts = analysis.motion_prompts;
      await Promise.all([
        generateClip({ framedImagePath: framed, imageUrl, prompt: prompts[0], outPath: clip1, variant: 0 }),
        generateClip({ framedImagePath: framed, imageUrl, prompt: prompts[1], outPath: clip2, variant: 1 }),
      ]);
      await Promise.all([
        uploadFrom(clip1, clipPaths[0], 'video/mp4'),
        uploadFrom(clip2, clipPaths[1], 'video/mp4'),
      ]);
    }

    // 4. Montage.
    await setStatus(job.id, 'editing');
    const outVideo = path.join(work, 'video.mp4');
    const outThumb = path.join(work, 'thumb.jpg');
    await montage({
      workDir: work,
      clip1,
      clip2,
      framedImage: framed,
      productName: analysis.product_name,
      hook: analysis.hook,
      lines: analysis.lines,
      cta: analysis.cta,
      musicFile: path.join(env.musicDir, `${job.tone}-${job.music}.mp3`),
      fontFile: env.fontFile,
      outVideo,
      outThumb,
    });

    const videoPath = `${job.user_id}/jobs/${job.id}/video.mp4`;
    const thumbPath = `${job.user_id}/jobs/${job.id}/thumb.jpg`;
    await Promise.all([
      uploadFrom(outVideo, videoPath, 'video/mp4'),
      uploadFrom(outThumb, thumbPath, 'image/jpeg'),
    ]);
    await setStatus(job.id, 'done', { video_path: videoPath, thumb_path: thumbPath, error: null });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function fail(job: VideoJob, message: string): Promise<void> {
  await setStatus(job.id, 'failed', { error: message });
  const { error } = await supabase.rpc('refund_video_job', { p_job: job.id });
  if (error) console.error(`[worker] remboursement impossible pour ${job.id} : ${error.message}`);
}

async function handle(job: VideoJob): Promise<void> {
  const started = Date.now();
  try {
    await runJob(job);
    console.log(`[worker] job ${job.id} (${job.kind}) terminé en ${Math.round((Date.now() - started) / 1000)} s`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] job ${job.id} en échec (tentative ${job.attempts}) : ${message}`);
    if (err instanceof UserFacingError && err.final) {
      await fail(job, err.message);
    } else if (job.attempts < 2) {
      // Erreur technique : une seconde tentative avant d'afficher un échec.
      await setStatus(job.id, 'queued');
    } else {
      await fail(job, GENERIC_ERROR);
    }
  }
}

async function claim(): Promise<VideoJob | null> {
  const { data, error } = await supabase.rpc('claim_video_job');
  if (error) {
    console.error(`[worker] réservation impossible : ${error.message}`);
    return null;
  }
  return ((data as VideoJob[] | null) ?? [])[0] ?? null;
}

async function sweepStale(): Promise<void> {
  const { data } = await supabase.rpc('stale_video_jobs');
  for (const job of (data as VideoJob[] | null) ?? []) await fail(job, GENERIC_ERROR);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Boucle du worker : dépile les jobs, `WORKER_CONCURRENCY` à la fois. */
export async function startWorker(): Promise<void> {
  console.log(`[worker] démarré (${env.workerConcurrency} jobs en parallèle)`);
  let active = 0;
  let lastSweep = 0;
  for (;;) {
    try {
      if (Date.now() - lastSweep > 60_000) {
        lastSweep = Date.now();
        await sweepStale();
      }
      if (active < env.workerConcurrency) {
        const job = await claim();
        if (job) {
          active += 1;
          void handle(job)
            .catch((err) => console.error('[worker] erreur inattendue', err))
            .finally(() => {
              active -= 1;
            });
          continue;
        }
      }
    } catch (err) {
      console.error('[worker] erreur de boucle', err);
    }
    await sleep(2000);
  }
}
