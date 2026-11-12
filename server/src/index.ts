import { serve } from '@hono/node-server';
import { api } from './api.js';
import { env, MOCK_AI } from './env.js';
import { startWorker } from './worker.js';

serve({ fetch: api.fetch, port: env.port }, (info) => {
  console.log(`[api] à l'écoute sur le port ${info.port}${MOCK_AI ? ' (MOCK_AI : aucun appel payant)' : ''}`);
});

// L'API et le worker tournent dans le même processus : un seul service à déployer.
// Pour les séparer plus tard, lancer startWorker() depuis un second conteneur.
void startWorker();
