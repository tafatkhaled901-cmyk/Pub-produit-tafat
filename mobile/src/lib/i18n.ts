import type { Language, Tone } from './api';

const fr = {
  tagline: 'Une photo. Une pub vidéo de 12 secondes.',
  credits: (n: number) => `${n} vidéo${n > 1 ? 's' : ''} restante${n > 1 ? 's' : ''}`,
  tone: 'Ton',
  language: 'Langue des textes',
  capture: 'Photographier le produit',
  importPhoto: 'Importer depuis la galerie',
  noCredits: 'Vous n’avez plus de vidéo disponible.',
  cameraDenied: 'Autorisez l’appareil photo dans les réglages pour photographier votre produit.',
  steps: ['Analyse du produit', 'Écriture du script', 'Création des images', 'Montage final'],
  sending: 'Envoi de la photo…',
  leaveHint: 'Comptez 2 à 4 minutes. Vous pouvez quitter l’app : la vidéo vous attendra à votre retour.',
  failedTitle: 'La vidéo n’a pas pu être créée',
  retry: 'Réessayer',
  back: 'Retour',
  music: 'Changer la musique',
  save: 'Enregistrer',
  share: 'Partager',
  saved: 'Vidéo enregistrée dans votre galerie.',
  saveDenied: 'Autorisez l’accès aux photos pour enregistrer la vidéo.',
  rendering: 'Nouveau rendu…',
  newVideo: 'Nouvelle vidéo',
  genericError: 'Une erreur est survenue. Vérifiez votre connexion et réessayez.',
};

const es: typeof fr = {
  tagline: 'Una foto. Un anuncio en vídeo de 12 segundos.',
  credits: (n: number) => `${n} vídeo${n === 1 ? '' : 's'} disponible${n === 1 ? '' : 's'}`,
  tone: 'Tono',
  language: 'Idioma de los textos',
  capture: 'Fotografiar el producto',
  importPhoto: 'Importar de la galería',
  noCredits: 'No te quedan vídeos disponibles.',
  cameraDenied: 'Permite el acceso a la cámara en los ajustes para fotografiar tu producto.',
  steps: ['Análisis del producto', 'Redacción del guion', 'Creación de las imágenes', 'Montaje final'],
  sending: 'Enviando la foto…',
  leaveHint: 'Tarda de 2 a 4 minutos. Puedes salir de la app: el vídeo te esperará a la vuelta.',
  failedTitle: 'No se pudo crear el vídeo',
  retry: 'Reintentar',
  back: 'Volver',
  music: 'Cambiar la música',
  save: 'Guardar',
  share: 'Compartir',
  saved: 'Vídeo guardado en tu galería.',
  saveDenied: 'Permite el acceso a las fotos para guardar el vídeo.',
  rendering: 'Nuevo render…',
  newVideo: 'Nuevo vídeo',
  genericError: 'Ha ocurrido un error. Comprueba tu conexión e inténtalo de nuevo.',
};

export const strings: Record<Language, typeof fr> = { fr, es };

export const toneLabels: Record<Language, Record<Tone, string>> = {
  fr: { dynamique: 'Dynamique', professionnel: 'Professionnel', humoristique: 'Humoristique' },
  es: { dynamique: 'Dinámico', professionnel: 'Profesional', humoristique: 'Divertido' },
};

export const TONES: Tone[] = ['dynamique', 'professionnel', 'humoristique'];
export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
];
