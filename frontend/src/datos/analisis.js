/**
 * Operaciones sobre los análisis guardados.
 *
 * Ninguna vista llama a `supabase` directamente: todo pasa por aquí.
 *
 * En los `select` no filtramos por `usuario_id`: RLS ya lo hace del lado
 * del servidor. Añadirlo a mano no daría seguridad extra y sugeriría, en
 * falso, que la protección vive en el cliente.
 */

import { supabase, usuarioId } from "./supabase.js";

const SIN_CUENTAS = "Las cuentas no están configuradas.";

/** Columnas ligeras para listar. Los jsonb pesan y el historial no los necesita. */
const COLUMNAS_LISTA =
  "id, etiqueta, delta_anualizado, phe, tev, buffer, horizonte, creado_en, estado_cuenta_id";

export async function guardarAnalisis({
  etiqueta,
  pesos,
  buffer,
  horizonte,
  datos,
  estadoCuentaId = null,
}) {
  if (!supabase) throw new Error(SIN_CUENTAS);
  const usuario_id = await usuarioId();
  if (!usuario_id) throw new Error("Inicia sesión para guardar tu análisis.");

  const { data, error } = await supabase
    .from("analisis")
    .insert({
      usuario_id,
      estado_cuenta_id: estadoCuentaId,
      etiqueta,
      pesos,
      buffer,
      horizonte,
      inflacion: datos.inflacion,
      optimo: datos.optimo,
      riesgo: datos.riesgo,
      // Desnormalización deliberada: el historial se lista sin abrir un jsonb.
      delta_anualizado: datos.inflacion?.delta_anualizado ?? null,
      phe: datos.optimo?.phe ?? null,
      tev: datos.optimo?.tev ?? null,
    })
    .select(COLUMNAS_LISTA)
    .single();

  if (error) throw new Error("No pudimos guardar tu análisis. Intenta de nuevo.");
  return data;
}

export async function listarAnalisis() {
  if (!supabase) throw new Error(SIN_CUENTAS);
  const { data, error } = await supabase
    .from("analisis")
    .select(COLUMNAS_LISTA)
    .order("creado_en", { ascending: false });

  if (error) throw new Error("No pudimos cargar tu historial.");
  return data ?? [];
}

/** Trae el análisis completo, con los tres jsonb. Solo al abrir o comparar. */
export async function leerAnalisis(id) {
  if (!supabase) throw new Error(SIN_CUENTAS);
  const { data, error } = await supabase
    .from("analisis")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error("No pudimos abrir ese análisis.");
  return data;
}

export async function renombrarAnalisis(id, etiqueta) {
  if (!supabase) throw new Error(SIN_CUENTAS);
  const { error } = await supabase.from("analisis").update({ etiqueta }).eq("id", id);
  if (error) throw new Error("No pudimos cambiar el nombre.");
}

export async function borrarAnalisis(id) {
  if (!supabase) throw new Error(SIN_CUENTAS);
  const { error } = await supabase.from("analisis").delete().eq("id", id);
  if (error) throw new Error("No pudimos borrar ese análisis.");
}
