# Image du serveur (API + worker), construite depuis la racine du dépôt.
# Railway détecte ce fichier automatiquement : aucun réglage de dossier à faire.
FROM node:22-slim

# FFmpeg pour le montage, DejaVu pour les textes à l'écran.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev
COPY server/assets ./assets

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
