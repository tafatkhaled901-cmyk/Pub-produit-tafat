# Pub Produit

Une photo de produit en entrée, une publicité vidéo verticale de 12 secondes en sortie
(TikTok, Reels, Shorts).

```
mobile/     App Expo (React Native) : capture, suivi, prévisualisation, export
server/     API + worker Node.js : analyse, clips IA, montage FFmpeg
supabase/   Schéma de la base (comptes, jobs, crédits, stockage)
```

## Comment ça marche

1. L'app envoie la photo dans le stockage Supabase, puis crée un job (1 crédit).
2. Le worker cadre la photo en 9:16, demande au LLM la fiche produit et le script,
   génère 2 clips de 5 s à partir de la photo, puis monte la vidéo avec FFmpeg :
   clip 1 + clip 2 + plan final sur la vraie photo, textes animés, musique.
3. L'app suit le job en temps réel, lit la vidéo, l'enregistre ou la partage.
4. Changer la musique ou le ton refait seulement le montage : gratuit, quelques secondes.

## Mise en route

### 1. Supabase

1. Créer un projet sur supabase.com.
2. SQL Editor : coller et exécuter `supabase/migrations/001_init.sql`.
3. Authentication > Sign In / Providers : activer **Anonymous sign-ins**.
4. Project Settings > API : noter l'URL, la clé `anon` et la clé `service_role`.

### 2. Serveur

Prérequis : Node.js 22 et FFmpeg installés (ou Docker).

```bash
cd server
cp .env.example .env      # remplir SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev
```

Avec `MOCK_AI=1` (valeur par défaut du fichier d'exemple), aucun appel payant n'est fait :
le script est un texte d'exemple et les clips sont de simples zooms sur la photo.
C'est le bon mode pour tester l'app de bout en bout.

Pour de vraies vidéos : `MOCK_AI=0`, puis remplir `ANTHROPIC_API_KEY` et `FAL_KEY`.
Le modèle vidéo se change avec `VIDEO_MODEL`, sans toucher au code.

Tester le montage seul, sans Supabase ni clé :

```bash
npm run test:montage -- chemin/vers/photo.jpg
```

### 3. App mobile

```bash
cd mobile
cp .env.example .env      # URL du serveur (IP locale de l'ordinateur), URL et clé anon Supabase
npm install
npx expo start
```

L'app utilise des modules natifs (caméra, galerie, vidéo). Pour tout tester sur un vrai
téléphone, créer un build de développement : `npx expo run:android` ou `npx expo run:ios`
(ou EAS Build).

### 4. Déploiement du serveur

`server/Dockerfile` contient tout (Node, FFmpeg, police). Il se déploie tel quel sur
Railway, Fly.io ou Cloud Run avec les variables de `.env`. L'API et le worker tournent
dans le même conteneur.

## Ce qui est fait, ce qui reste

Fait : capture et import, choix du ton et de la langue (français, espagnol), contrôle de la
photo par le LLM, progression en 4 étapes, reprise de la vidéo après fermeture de l'app,
lecture en boucle, enregistrement dans la galerie, partage natif, changement de musique et
de ton sans régénération, crédits (3 offerts) avec remboursement automatique en cas d'échec.

Reste à faire :

- **Musiques** : aucun fichier fourni, voir `server/assets/music/README.md`.
- **Détourage du produit** : la photo est posée sur son propre fond flouté ; pas encore de
  suppression du fond.
- **Notifications push** de fin de génération.
- **Connexion par e-mail, Google ou Apple** : aujourd'hui, session anonyme uniquement, donc
  les crédits sont liés à l'installation de l'app.
- **Achat de crédits**, historique des vidéos, publication directe TikTok, arabe.

## Vérifications déjà faites

- Montage FFmpeg exécuté sur une image de test : MP4 H.264 1080 × 1920, 30 i/s, 12 s, audio AAC.
- Migration SQL exécutée sur PostgreSQL 16 : débit, refus sans crédit, remboursement unique.
- Serveur et app : typage TypeScript sans erreur ; bundle Android de l'app généré.

Non vérifié ici, faute de comptes et de clés : l'exécution sur un vrai téléphone, les appels
réels à Supabase, au LLM et au modèle vidéo.
