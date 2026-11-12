import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ffmpeg, FPS, HEIGHT, WIDTH } from './ffmpeg.js';

export const CLIP_SECONDS = 5;
export const FINAL_SECONDS = 2;
export const TOTAL_SECONDS = CLIP_SECONDS * 2 + FINAL_SECONDS;

export interface MontageInput {
  /** Dossier de travail (fichiers texte temporaires). */
  workDir: string;
  clip1: string;
  clip2: string;
  /** Photo réelle cadrée en 9:16, utilisée pour le plan final. */
  framedImage: string;
  productName: string;
  hook: string;
  lines: [string, string];
  cta: string;
  /** Chemin d'un MP3, ou null pour une vidéo sans musique. */
  musicFile: string | null;
  fontFile: string;
  outVideo: string;
  outThumb: string;
}

/** Coupe un texte en lignes d'au plus `max` caractères, sans couper les mots. */
export function wrap(text: string, max: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && (current + ' ' + word).length > max) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

/** Échappe un chemin pour une option de filtre FFmpeg. */
function esc(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

interface TextBlock {
  text: string;
  /** Taille de police en pixels. */
  size: number;
  /** Nombre maximal de caractères par ligne. */
  maxChars: number;
  /** Position verticale du centre du bloc, en fraction de la hauteur. */
  center: number;
  start: number;
  end: number;
}

async function drawBlock(block: TextBlock, index: number, input: MontageInput): Promise<string[]> {
  const lines = wrap(block.text, block.maxChars);
  const lineHeight = Math.round(block.size * 1.25);
  const top = Math.round(HEIGHT * block.center - (lines.length * lineHeight) / 2);
  const fade = 0.3;
  const { start: a, end: b } = block;
  const alpha = `if(lt(t,${a + fade}),(t-${a})/${fade},if(gt(t,${b - fade}),(${b}-t)/${fade},1))`;

  const filters: string[] = [];
  for (const [i, line] of lines.entries()) {
    // Le texte passe par un fichier : aucun caractère à échapper, accents compris.
    const file = path.join(input.workDir, `text-${index}-${i}.txt`);
    await writeFile(file, line, 'utf8');
    filters.push(
      [
        `drawtext=fontfile='${esc(input.fontFile)}'`,
        `textfile='${esc(file)}'`,
        `fontsize=${block.size}`,
        'fontcolor=white',
        `borderw=${Math.max(4, Math.round(block.size / 14))}`,
        'bordercolor=black@0.6',
        'x=(w-text_w)/2',
        `y=${top + i * lineHeight}`,
        `alpha='${alpha}'`,
        `enable='between(t,${a},${b})'`,
      ].join(':'),
    );
  }
  return filters;
}

/**
 * Assemble la vidéo finale : clip 1 + clip 2 + plan final sur la vraie photo,
 * textes animés, musique, MP4 H.264 1080 × 1920.
 */
export async function montage(input: MontageInput): Promise<void> {
  const size = `${WIDTH}:${HEIGHT}`;
  const clipFilter = (src: string, out: string) =>
    `[${src}]scale=${size}:force_original_aspect_ratio=increase,crop=${size},fps=${FPS},setsar=1,` +
    `tpad=stop_mode=clone:stop_duration=2,trim=duration=${CLIP_SECONDS},setpts=PTS-STARTPTS[${out}]`;

  const finalFrames = FINAL_SECONDS * FPS;
  const finalFilter =
    `[2:v]scale=${WIDTH * 2}:${HEIGHT * 2},` +
    `zoompan=z='1+0.06*on/${finalFrames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'` +
    `:d=${finalFrames}:s=${WIDTH}x${HEIGHT}:fps=${FPS},setsar=1[v2]`;

  const c1 = CLIP_SECONDS;
  const c2 = CLIP_SECONDS * 2;
  const blocks: TextBlock[] = [
    { text: input.hook, size: 104, maxChars: 15, center: 0.17, start: 0.3, end: c1 - 0.2 },
    { text: input.lines[0], size: 72, maxChars: 22, center: 0.76, start: c1 + 0.2, end: c1 + 2.4 },
    { text: input.lines[1], size: 72, maxChars: 22, center: 0.76, start: c1 + 2.6, end: c2 - 0.2 },
    { text: input.productName, size: 60, maxChars: 26, center: 0.15, start: c2 + 0.1, end: TOTAL_SECONDS },
    { text: input.cta, size: 92, maxChars: 17, center: 0.78, start: c2 + 0.1, end: TOTAL_SECONDS },
  ].filter((b) => b.text.trim().length > 0);

  const draws: string[] = [];
  for (const [i, block] of blocks.entries()) draws.push(...(await drawBlock(block, i, input)));

  const fadeOut = `fade=t=out:st=${TOTAL_SECONDS - 0.4}:d=0.4`;
  const video = [
    clipFilter('0:v', 'v0'),
    clipFilter('1:v', 'v1'),
    finalFilter,
    `[v0][v1][v2]concat=n=3:v=1:a=0[vc]`,
    `[vc]${[...draws, fadeOut, 'format=yuv420p'].join(',')}[vout]`,
  ];

  const hasMusic = input.musicFile !== null && (await access(input.musicFile).then(() => true, () => false));
  const audioInput = hasMusic
    ? ['-stream_loop', '-1', '-i', input.musicFile as string]
    : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];
  const audio =
    `[3:a]atrim=0:${TOTAL_SECONDS},asetpts=PTS-STARTPTS,` +
    `afade=t=in:d=0.4,afade=t=out:st=${TOTAL_SECONDS - 1}:d=1,volume=0.85[aout]`;

  await ffmpeg([
    '-i', input.clip1,
    '-i', input.clip2,
    '-i', input.framedImage,
    ...audioInput,
    '-filter_complex', [...video, audio].join(';'),
    '-map', '[vout]',
    '-map', '[aout]',
    '-t', String(TOTAL_SECONDS),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    input.outVideo,
  ]);

  await ffmpeg(['-ss', '1', '-i', input.outVideo, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '3', input.outThumb]);
}

/** Clip de démonstration fabriqué par FFmpeg (MOCK_AI=1) : zoom lent sur la photo, aucun coût. */
export async function mockClip(framedImage: string, outPath: string, variant: 0 | 1): Promise<void> {
  const frames = CLIP_SECONDS * FPS;
  const zoom = variant === 0 ? `1+0.18*on/${frames}` : `1.18-0.18*on/${frames}`;
  await ffmpeg([
    '-i', framedImage,
    '-vf',
    `scale=${WIDTH * 2}:${HEIGHT * 2},zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'` +
      `:d=${frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS},format=yuv420p`,
    '-t', String(CLIP_SECONDS),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    outPath,
  ]);
}
