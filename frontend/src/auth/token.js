/**
 * Enganche de autenticación para las llamadas a FastAPI.
 *
 * `api/client.js` llama a `encabezadosAuth()` en cada petición y a
 * `alPerderSesion()` cuando el backend responde 401.
 */

import { supabase } from "../datos/supabase.js";

export async function encabezadosAuth() {
  if (!supabase) return {};
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    // Nunca lanzamos: un fallo aquí dejaría al usuario sin poder ni cargar
    // el dashboard, y el 401 posterior ya comunica el problema.
    return {};
  }
}

/**
 * Se invoca cuando el backend responde 401. Idempotente a propósito:
 * pueden llegar varios 401 seguidos si había peticiones en vuelo.
 */
let cerrando = false;

export function alPerderSesion() {
  if (cerrando || !supabase) return;
  cerrando = true;
  supabase.auth.signOut().finally(() => {
    cerrando = false;
  });
}
