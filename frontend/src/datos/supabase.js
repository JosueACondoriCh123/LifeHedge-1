import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * `null` si faltan las variables de entorno.
 *
 * No lanzamos al importar a propósito: un `throw` aquí tumbaría la
 * aplicación entera antes de pintar nada, y el mensaje que vería el usuario
 * sería una pantalla en blanco. En vez de eso, `hayCuentas` queda en false
 * y la interfaz lo explica.
 */
export const supabase = url && anon ? createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
}) : null;

export const supabaseConfigurado = supabase !== null;

/** Id del usuario en sesión, o null. */
export async function usuarioId() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}
