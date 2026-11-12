export const TONES = ['dynamique', 'professionnel', 'humoristique'] as const;
export type Tone = (typeof TONES)[number];

export const LANGUAGES = ['fr', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];

export type JobStatus = 'queued' | 'analyzing' | 'clips' | 'editing' | 'done' | 'failed';

/** Ce que le LLM renvoie à partir de la photo. */
export interface Analysis {
  usable: boolean;
  reject_reason: string;
  product_name: string;
  category: string;
  strengths: string[];
  audience: string;
  /** Accroche, 6 mots maximum. */
  hook: string;
  /** Deux textes courts affichés pendant le second clip. */
  lines: [string, string];
  /** Appel à l'action du plan final. */
  cta: string;
  /** Un prompt de mouvement (en anglais) par clip IA. */
  motion_prompts: [string, string];
}

export interface VideoJob {
  id: string;
  user_id: string;
  kind: 'full' | 'remix';
  source_job_id: string | null;
  photo_path: string;
  tone: Tone;
  language: Language;
  music: number;
  status: JobStatus;
  error: string | null;
  analysis: Analysis | null;
  video_path: string | null;
  thumb_path: string | null;
  attempts: number;
}

/** Erreur dont le message peut être montré tel quel à l'utilisateur. */
export class UserFacingError extends Error {
  /** true : inutile de réessayer (photo inexploitable, par exemple). */
  readonly final: boolean;
  constructor(message: string, final = true) {
    super(message);
    this.final = final;
  }
}
