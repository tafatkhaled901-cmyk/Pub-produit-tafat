import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { config } from './config';

export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Compte sans friction : une session anonyme est créée au premier lancement.
 * (Activer « Anonymous sign-ins » dans Supabase > Authentication > Providers.)
 */
export async function ensureSession(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.access_token;
  const created = await supabase.auth.signInAnonymously();
  if (created.error || !created.data.session) {
    throw new Error(created.error?.message ?? 'Connexion impossible.');
  }
  return created.data.session.access_token;
}
