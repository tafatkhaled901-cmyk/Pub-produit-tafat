import { fal } from '@fal-ai/client';
import { writeFile } from 'node:fs/promises';
import { env, MOCK_AI } from '../env.js';
import { CLIP_SECONDS, mockClip } from './montage.js';

if (!MOCK_AI) fal.config({ credentials: env.falKey });

/**
 * Génère un clip de 5 secondes à partir de l'image du produit.
 * `imageUrl` doit être accessible publiquement (URL signée du stockage).
 * Changer de modèle : variables VIDEO_MODEL et VIDEO_IMAGE_PARAM, sans toucher au code.
 */
export async function generateClip(opts: {
  framedImagePath: string;
  imageUrl: string;
  prompt: string;
  outPath: string;
  variant: 0 | 1;
}): Promise<void> {
  if (MOCK_AI) {
    await mockClip(opts.framedImagePath, opts.outPath, opts.variant);
    return;
  }

  const result = await fal.subscribe(env.videoModel, {
    input: {
      prompt: opts.prompt,
      [env.videoImageParam]: opts.imageUrl,
      duration: String(CLIP_SECONDS),
    },
    logs: false,
  });

  const url = (result.data as { video?: { url?: string } } | undefined)?.video?.url;
  if (!url) throw new Error('Le modèle vidéo n’a renvoyé aucun fichier.');

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Téléchargement du clip impossible (${response.status}).`);
  await writeFile(opts.outPath, Buffer.from(await response.arrayBuffer()));
}
