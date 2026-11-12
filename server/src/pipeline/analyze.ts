import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { env, MOCK_AI } from '../env.js';
import type { Analysis, Language, Tone } from '../types.js';

const analysisSchema = z.object({
  usable: z.boolean(),
  reject_reason: z.string(),
  product_name: z.string(),
  category: z.string(),
  strengths: z.array(z.string()).max(5),
  audience: z.string(),
  hook: z.string(),
  lines: z.tuple([z.string(), z.string()]),
  cta: z.string(),
  motion_prompts: z.tuple([z.string(), z.string()]),
});

const TONE_GUIDE: Record<Tone, string> = {
  dynamique: 'énergique, phrases très courtes, verbes d’action, rythme rapide',
  professionnel: 'sobre, précis, rassurant, centré sur le bénéfice concret',
  humoristique: 'léger, complice, un trait d’humour bon enfant, jamais moqueur',
};

const LANGUAGE_NAME: Record<Language, string> = { fr: 'français', es: 'espagnol' };

const TOOL_NAME = 'rendre_script_publicitaire';

function buildPrompt(tone: Tone, language: Language): string {
  return [
    'Tu es directeur de création pour des publicités vidéo verticales de 12 secondes (TikTok, Reels, Shorts).',
    'Voici la photo d’un produit prise par un commerçant.',
    '',
    'Étape 1 — Contrôle. Mets usable=false, avec une raison courte et polie dans reject_reason, si :',
    '- aucun produit physique n’est clairement visible, ou la photo est trop floue ou trop sombre ;',
    '- le sujet principal est une personne ou un visage ;',
    '- le produit est illégal, dangereux, à caractère sexuel, ou relève du tabac, de l’alcool, des armes ou des médicaments.',
    'Dans ce cas, laisse les autres champs vides.',
    '',
    'Étape 2 — Si la photo est exploitable, décris le produit uniquement d’après ce qui est visible.',
    'N’invente ni prix, ni promotion, ni chiffre, ni allégation de santé, ni nom de marque illisible sur la photo.',
    '',
    `Étape 3 — Écris le script en ${LANGUAGE_NAME[language]}, ton ${tone} (${TONE_GUIDE[tone]}) :`,
    '- hook : accroche de 6 mots maximum, affichée pendant les 5 premières secondes ;',
    '- lines : deux textes de 7 mots maximum chacun, un bénéfice par texte ;',
    '- cta : appel à l’action de 4 mots maximum ;',
    '- pas d’émoji, pas de hashtag, pas de guillemets.',
    '',
    'Étape 4 — motion_prompts : deux prompts en anglais pour un modèle image-vers-vidéo, un par plan de 5 secondes.',
    'L’image fournie est la première image du plan. Le produit doit rester identique : même forme, mêmes couleurs,',
    'même étiquette. Ne décris que des mouvements de caméra lents et de la lumière (slow push-in, gentle orbit,',
    'soft light sweep). Pas de mains, pas de personnes, pas de texte, pas de transformation du produit.',
    `Les champs product_name, category, strengths et audience sont en ${LANGUAGE_NAME[language]}.`,
  ].join('\n');
}

const TOOL_SCHEMA = {
  type: 'object' as const,
  properties: {
    usable: { type: 'boolean' },
    reject_reason: { type: 'string' },
    product_name: { type: 'string' },
    category: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    audience: { type: 'string' },
    hook: { type: 'string' },
    lines: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
    cta: { type: 'string' },
    motion_prompts: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
  },
  required: [
    'usable', 'reject_reason', 'product_name', 'category', 'strengths',
    'audience', 'hook', 'lines', 'cta', 'motion_prompts',
  ],
};

const MOCK: Record<Language, Record<Tone, Pick<Analysis, 'hook' | 'lines' | 'cta'>>> = {
  fr: {
    dynamique: { hook: 'Il vous le faut', lines: ['Prêt en un geste', 'Conçu pour durer'], cta: 'Commandez maintenant' },
    professionnel: { hook: 'La qualité se voit', lines: ['Des finitions soignées', 'Un choix sûr'], cta: 'Découvrez-le' },
    humoristique: { hook: 'Oui, il est vrai', lines: ['Vos amis seront jaloux', 'Et vous, ravis'], cta: 'Craquez sans regret' },
  },
  es: {
    dynamique: { hook: 'Lo necesitas ya', lines: ['Listo en un gesto', 'Hecho para durar'], cta: 'Pídelo ahora' },
    professionnel: { hook: 'La calidad se nota', lines: ['Acabados cuidados', 'Una elección segura'], cta: 'Descúbrelo' },
    humoristique: { hook: 'Sí, es real', lines: ['Tus amigos, celosos', 'Y tú, feliz'], cta: 'Date el gusto' },
  },
};

function mockAnalysis(tone: Tone, language: Language): Analysis {
  return {
    usable: true,
    reject_reason: '',
    product_name: language === 'fr' ? 'Produit de démonstration' : 'Producto de demostración',
    category: 'demo',
    strengths: [],
    audience: '',
    ...MOCK[language][tone],
    motion_prompts: ['slow push-in on the product', 'gentle orbit around the product'],
  };
}

/** Un seul appel : contrôle de la photo, fiche produit, script et prompts de mouvement. */
export async function analyzeProduct(imagePath: string, tone: Tone, language: Language): Promise<Analysis> {
  if (MOCK_AI) return mockAnalysis(tone, language);

  const client = new Anthropic({ apiKey: env.anthropicKey });
  const image = await readFile(imagePath);

  const response = await client.messages.create({
    model: env.llmModel,
    max_tokens: 1024,
    tools: [
      {
        name: TOOL_NAME,
        description: 'Rend le résultat du contrôle de la photo et le script publicitaire.',
        input_schema: TOOL_SCHEMA,
      },
    ],
    tool_choice: { type: 'tool', name: TOOL_NAME },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.toString('base64') } },
          { type: 'text', text: buildPrompt(tone, language) },
        ],
      },
    ],
  });

  const block = response.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') throw new Error('Le modèle n’a pas renvoyé de script.');
  return analysisSchema.parse(block.input);
}
