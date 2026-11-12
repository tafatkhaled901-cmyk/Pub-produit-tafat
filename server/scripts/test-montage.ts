/**
 * Test local du montage, sans Supabase ni API payante :
 *   npm run test:montage -- chemin/vers/photo.jpg [dossier-de-sortie]
 * Produit framed.jpg, clip1.mp4, clip2.mp4 (clips de démonstration), video.mp4 et thumb.jpg.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { frameTo916 } from '../src/pipeline/frame.js';
import { mockClip, montage } from '../src/pipeline/montage.js';

const [photo, outDir = 'out'] = process.argv.slice(2);
if (!photo) {
  console.error('Usage : npm run test:montage -- photo.jpg [dossier-de-sortie]');
  process.exit(1);
}

await mkdir(outDir, { recursive: true });
const framed = path.join(outDir, 'framed.jpg');
const clip1 = path.join(outDir, 'clip1.mp4');
const clip2 = path.join(outDir, 'clip2.mp4');

await frameTo916(photo, framed);
await Promise.all([mockClip(framed, clip1, 0), mockClip(framed, clip2, 1)]);
await montage({
  workDir: outDir,
  clip1,
  clip2,
  framedImage: framed,
  productName: 'Savon artisanal à l’huile d’olive',
  hook: 'Votre peau va adorer ça',
  lines: ['Fabriqué à la main, sans additifs', 'Un parfum doux qui dure'],
  cta: 'Commandez le vôtre',
  musicFile: process.env.MUSIC_FILE ?? null,
  fontFile: process.env.FONT_FILE ?? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  outVideo: path.join(outDir, 'video.mp4'),
  outThumb: path.join(outDir, 'thumb.jpg'),
});
console.log(`Vidéo prête : ${path.join(outDir, 'video.mp4')}`);
