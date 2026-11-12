import { ffmpeg, HEIGHT, WIDTH } from './ffmpeg.js';

/**
 * Met la photo au format vertical 9:16 sans la rogner : le produit entier reste
 * visible, posé sur une version floutée de la même photo.
 * Cette image sert de première image aux clips IA et de plan final.
 */
export async function frameTo916(photoPath: string, outPath: string): Promise<void> {
  const size = `${WIDTH}:${HEIGHT}`;
  await ffmpeg([
    '-i', photoPath,
    '-filter_complex',
    [
      '[0:v]split=2[a][b]',
      `[a]scale=${size}:force_original_aspect_ratio=increase,crop=${size},gblur=sigma=40,eq=brightness=-0.06[bg]`,
      `[b]scale=${size}:force_original_aspect_ratio=decrease[fg]`,
      '[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuvj420p',
    ].join(';'),
    '-frames:v', '1',
    '-q:v', '2',
    outPath,
  ]);
}
