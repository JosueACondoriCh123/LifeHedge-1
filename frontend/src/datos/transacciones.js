import { supabase, usuarioId } from "./supabase.js";

const SIN_CUENTAS = "Las cuentas no están configuradas.";

/**
 * Consulta las transacciones bancarias del usuario autenticado ordenadas por fecha.
 */
export async function listarTransacciones(limite = 200) {
  if (!supabase) return [];
  const uId = await usuarioId();
  if (!uId) return [];

  const { data, error } = await supabase
    .from("transacciones_bancarias")
    .select("*")
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(limite);

  if (error) {
    console.warn("Error consultando transacciones:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Guarda en bloque una lista de transacciones extraídas de un estado de cuenta.
 */
export async function guardarTransacciones(transacciones, estadoCuentaId = null) {
  if (!supabase || !transacciones || transacciones.length === 0) return [];
  const uId = await usuarioId();
  if (!uId) return [];

  const filas = transacciones.map((t) => ({
    usuario_id: uId,
    estado_cuenta_id: estadoCuentaId,
    fecha: t.fecha || new Date().toISOString().slice(0, 10),
    concepto: (t.concepto || t.descripcion || "MOVIMIENTO").trim(),
    monto: Math.abs(Number(t.monto) || 0),
    rubro: (t.rubro || "otros").toLowerCase(),
    moneda: t.moneda || "MXN",
  }));

  const { data, error } = await supabase
    .from("transacciones_bancarias")
    .insert(filas)
    .select();

  if (error) {
    console.error("Error guardando transacciones en Supabase:", error.message);
    throw new Error("No se pudieron guardar las transacciones en la nube.");
  }

  return data ?? [];
}

/**
 * Inserta un movimiento capturado manualmente por el usuario.
 */
export async function crearTransaccionManual({ fecha, concepto, monto, rubro, moneda = "MXN" }) {
  if (!supabase) throw new Error(SIN_CUENTAS);
  const uId = await usuarioId();
  if (!uId) throw new Error("Inicia sesión para guardar movimientos.");

  const { data, error } = await supabase
    .from("transacciones_bancarias")
    .insert({
      usuario_id: uId,
      fecha: fecha || new Date().toISOString().slice(0, 10),
      concepto: (concepto || "").trim(),
      monto: Math.abs(Number(monto) || 0),
      rubro: (rubro || "otros").toLowerCase(),
      moneda,
    })
    .select()
    .single();

  if (error) {
    throw new Error("Error al registrar movimiento: " + error.message);
  }

  return data;
}

/**
 * Elimina una transacción por su ID.
 */
export async function eliminarTransaccion(id) {
  if (!supabase) throw new Error(SIN_CUENTAS);
  const uId = await usuarioId();
  if (!uId) throw new Error("Inicia sesión para eliminar movimientos.");

  const { error } = await supabase
    .from("transacciones_bancarias")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error("Error al eliminar transacción: " + error.message);
  }
}
