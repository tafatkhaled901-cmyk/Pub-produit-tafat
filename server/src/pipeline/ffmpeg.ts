import { execFile } from 'node:child_process';

/** Lance FFmpeg sans passer par un shell (aucune injection possible via les arguments). */
export function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffmpeg',
      ['-hide_banner', '-loglevel', 'error', '-y', ...args],
      { maxBuffer: 16 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error) reject(new Error(`FFmpeg a échoué : ${stderr.trim().slice(-800) || error.message}`));
        else resolve();
      },
    );
  });
}

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;
