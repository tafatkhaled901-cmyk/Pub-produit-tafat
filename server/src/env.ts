import path from 'node:path';
import { fileURLToPath } from 'node:url';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

const here = path.dirname(fileURLToPath(import.meta.url));

/** MOCK_AI=1 : aucun appel payant. Script d'exemple + clips fabriqués par FFmpeg. */
export const MOCK_AI = process.env.MOCK_AI === '1';

export const env = {
  port: Number(process.env.PORT ?? 8787),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  bucket: process.env.STORAGE_BUCKET ?? 'media',

  anthropicKey: MOCK_AI ? '' : required('ANTHROPIC_API_KEY'),
  llmModel: process.env.LLM_MODEL ?? 'claude-sonnet-5-5',

  falKey: MOCK_AI ? '' : required('FAL_KEY'),
  /** Modèle image→vidéo. Changer ici suffit pour tester un autre modèle. */
  videoModel: process.env.VIDEO_MODEL ?? 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
  /** Nom du champ image attendu par le modèle (image_url, start_image_url…). */
  videoImageParam: process.env.VIDEO_IMAGE_PARAM ?? 'image_url',

  fontFile: process.env.FONT_FILE ?? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  musicDir: process.env.MUSIC_DIR ?? path.resolve(here, '../assets/music'),
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
  maxRemixesPerVideo: Number(process.env.MAX_REMIXES ?? 10),
};
