import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'node:fs/promises';
import { env } from './env.js';

/** Client serveur : clé service_role, contourne les politiques RLS. Ne jamais l'exposer à l'app. */
export const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const bucket = () => supabase.storage.from(env.bucket);

export async function downloadTo(storagePath: string, localPath: string): Promise<void> {
  const { data, error } = await bucket().download(storagePath);
  if (error || !data) throw new Error(`Téléchargement impossible (${storagePath}) : ${error?.message}`);
  await writeFile(localPath, Buffer.from(await data.arrayBuffer()));
}

export async function uploadFrom(localPath: string, storagePath: string, contentType: string): Promise<void> {
  const body = await readFile(localPath);
  const { error } = await bucket().upload(storagePath, body, { contentType, upsert: true });
  if (error) throw new Error(`Envoi impossible (${storagePath}) : ${error.message}`);
}

export async function exists(storagePath: string): Promise<boolean> {
  const slash = storagePath.lastIndexOf('/');
  const { data, error } = await bucket().list(storagePath.slice(0, slash), {
    search: storagePath.slice(slash + 1),
  });
  if (error) return false;
  return (data ?? []).some((f) => f.name === storagePath.slice(slash + 1));
}

export async function signedUrl(storagePath: string, seconds = 3600): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(storagePath, seconds);
  if (error || !data) throw new Error(`URL signée impossible (${storagePath}) : ${error?.message}`);
  return data.signedUrl;
}

export async function signedUploadUrl(storagePath: string): Promise<{ path: string; token: string }> {
  const { data, error } = await bucket().createSignedUploadUrl(storagePath);
  if (error || !data) throw new Error(`URL d'envoi impossible : ${error?.message}`);
  return { path: data.path, token: data.token };
}
