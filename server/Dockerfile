FROM node:22-slim

# FFmpeg pour le montage, DejaVu pour les textes à l'écran.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
COPY assets ./assets

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787
CMD ["node", "dist/index.js"]
