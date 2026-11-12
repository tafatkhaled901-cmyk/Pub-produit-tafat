function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Variable manquante dans mobile/.env : ${name}`);
  return value;
}

// Les variables EXPO_PUBLIC_* sont incluses dans l'app : n'y mettre que des valeurs publiques.
// La clé service_role et les clés d'API IA restent sur le serveur.
export const config = {
  apiUrl: required('EXPO_PUBLIC_API_URL', process.env.EXPO_PUBLIC_API_URL).replace(/\/$/, ''),
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
};
