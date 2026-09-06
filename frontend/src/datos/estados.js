/**
 * Estados de cuenta en PDF: subida, listado, descarga y borrado.
 *
 * El bucket `estados-cuenta` es privado y sus políticas se apoyan en que la
 * ruta del objeto **empiece con el id del usuario**. Si esa forma cambia,
 * Supabase rechaza la subida.
 */

import { supabase, usuarioId } from "./supabase.js";

const BUCKET = "estados-cuenta";
const SIN_CUENTAS = "Las cuentas no están configuradas.";
const SEGUNDOS_URL_FIRMADA = 60;

/**
 * Sube el PDF y registra el puntero.
 *
 * Llámala **después** de que `/statement/parse` haya funcionado: al revés
 * se acumulan archivos huérfanos de PDFs que ni siquiera se pudieron leer.
 */
export async function subirEstadoCuenta(archivo, emisor) {
  if (!supabase) throw new Error(SIN_CUENTAS);
  const usuario_id = await usuarioId();
  if (!usuario_id) throw new Error("Inicia sesión para guardar tu estado de cuenta.");

  const ruta = `${usuario_id}/${crypto.randomUUID()}.pdf`; // el prefijo es obligatorio

  const { error: errSubida } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, archivo, { contentType: "application/pdf", upsert: false });
  if (errSubida) throw new Error("No pudimos guardar tu estado de cuenta.");

  const { data, error } = await supabase
    .from("estados_cuenta")
    .insert({
      usuario_id,
      ruta_storage: ruta,
      nombre_archivo: archivo.name,
      emisor,
      bytes: archivo.size,
    })
    .select()
    .single();

  if (error) {
    // El registro falló pero el archivo ya subió: lo quitamos para no dejar
    // un PDF sin dueño en el bucket.
    await supabase.storage.from(BUCKET).remove([ruta]);
    throw new Error("No pudimos registrar tu estado de cuenta.");
  }
  return data;
}

export async function listarEstados() {
  if (!supabase) throw new Error(SIN_CUENTAS);
  const { data, error } = await supabase
    .from("estados_cuenta")
    .select("*")
    .order("subido_en", { ascending: false });

  if (error) throw new Error("No pudimos cargar tus estados de cuenta.");
  return data ?? [];
}

/** URL de corta duración. Nunca se sirve el bucket como público. */
export async function urlFirmada(ruta) {
  if (!supabase) throw new Error(SIN_CUENTAS);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(ruta, SEGUNDOS_URL_FIRMADA);
  if (error) throw new Error("No pudimos generar el enlace de descarga.");
  return data.signedUrl;
}

/**
 * Borra el objeto **y** la fila.
 *
 * Quitar solo la fila dejaría el PDF vivo en el bucket, y eso convertiría
 * la pantalla de privacidad en una mentira.
 */
export async function borrarEstado(estado) {
  if (!supabase) throw new Error(SIN_CUENTAS);

  const { error: errArchivo } = await supabase.storage
    .from(BUCKET)
    .remove([estado.ruta_storage]);
  if (errArchivo) throw new Error("No pudimos borrar el archivo.");

  const { error } = await supabase.from("estados_cuenta").delete().eq("id", estado.id);
  if (error) throw new Error("Borramos el archivo pero no el registro.");
}

/** Borra todo lo del usuario: archivos, estados y análisis. */
export async function borrarTodo() {
  if (!supabase) throw new Error(SIN_CUENTAS);
  const usuario_id = await usuarioId();
  if (!usuario_id) throw new Error("Inicia sesión primero.");

  const estados = await listarEstados();
  if (estados.length > 0) {
    const rutas = estados.map((e) => e.ruta_storage);
    const { error: errArchivos } = await supabase.storage.from(BUCKET).remove(rutas);
    if (errArchivos) throw new Error("No pudimos borrar tus archivos.");
  }

  // El orden importa: analisis referencia estados_cuenta.
  const { error: errAnalisis } = await supabase
    .from("analisis")
    .delete()
    .eq("usuario_id", usuario_id);
  if (errAnalisis) throw new Error("No pudimos borrar tus análisis.");

  const { error: errEstados } = await supabase
    .from("estados_cuenta")
    .delete()
    .eq("usuario_id", usuario_id);
  if (errEstados) throw new Error("No pudimos borrar tus estados de cuenta.");
}

/**
 * Purga de la base de datos los estados de cuenta vencidos (>90 días)
 * y elimina inmediatamente los archivos físicos asociados en el bucket de Storage.
 */
export async function purgarEstadosVencidosConStorage() {
  if (!supabase) throw new Error(SIN_CUENTAS);
  const { data, error } = await supabase.rpc("purgar_estados_con_rutas");
  if (error) throw new Error("No pudimos purgar los estados de cuenta vencidos.");

  if (data && data.length > 0) {
    const rutas = data.map((r) => r.ruta_storage).filter(Boolean);
    if (rutas.length > 0) {
      await supabase.storage.from(BUCKET).remove(rutas);
    }
  }
  return data ? data.length : 0;
}

