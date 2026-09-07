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
import { simularEstres } from "../api/client.js";

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

/**
 * Obtiene métricas acumuladas del usuario directamente desde la función RPC de Supabase.
 * Devuelve total_analisis, total_estados, bytes_almacenados, phe_promedio, delta_promedio.
 */
export async function obtenerResumenUsuario() {
  if (!supabase) throw new Error(SIN_CUENTAS);
  const { data, error } = await supabase.rpc("resumen_usuario");
  if (error) throw new Error("No pudimos obtener el resumen de tu cuenta.");
  return data;
}

/**
 * Compara dos análisis directamente en PostgreSQL.
 * Devuelve ambos registros y las diferencias calculadas en el servidor.
 */
export async function compararAnalisisRpc(idA, idB) {
  if (!supabase) throw new Error(SIN_CUENTAS);
  const { data, error } = await supabase.rpc("comparar_dos_analisis", {
    p_id_a: idA,
    p_id_b: idB,
  });
  if (error) throw new Error("No pudimos comparar los análisis seleccionados.");
  return data;
}

/**
 * Devuelve la serie temporal de análisis para gráficas en Recharts (Historial).
 */
export async function obtenerTendenciaHistorica() {
  if (!supabase) throw new Error(SIN_CUENTAS);
  const { data, error } = await supabase.rpc("tendencia_historica");
  if (error) throw new Error("No pudimos cargar la tendencia histórica.");
  return data ?? [];
}

/**
 * Actualiza de forma segura el nombre del perfil de usuario vía RPC.
 */
export async function actualizarNombrePerfil(nuevoNombre) {
  if (!supabase) throw new Error(SIN_CUENTAS);
  const { data, error } = await supabase.rpc("actualizar_nombre_perfil", {
    p_nuevo_nombre: nuevoNombre,
  });
  if (error) throw new Error(error.message || "No pudimos actualizar el nombre del perfil.");
  return data;
}

/**
 * ==============================================================================
 * CAPACIDADES PROFESIONALES E INSTITUCIONALES (RPC SUPABASE)
 * ==============================================================================
 */

/**
 * Calcula el LifeHedge Health Rating (0-100 pts y calificación AAA-BBB) en base de datos.
 */
export async function calcularScorePatrimonial(analisisId = null) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("calcular_score_patrimonial", {
    p_analisis_id: analisisId,
  });
  if (error) {
    console.warn("Aviso al calcular score patrimonial:", error.message);
    return null;
  }
  return data;
}

/**
 * Obtiene los benchmarks del mercado mexicano (Cetes, Consar, 60/40, IPC) con Alpha relativo.
 */
export async function obtenerBenchmarksComparativos(analisisId = null) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("obtener_benchmarks_comparativos", {
    p_analisis_id: analisisId,
  });
  if (error) {
    console.warn("Aviso al obtener benchmarks comparativos:", error.message);
    return null;
  }
  return data;
}

/**
 * Evalúa el desvío de cartera (corridor drift) y registra la revisión de rebalanceo.
 */
export async function evaluarDriftPortafolio(analisisId, pesosActuales, umbralDrift = 0.05) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("evaluar_drift_portafolio", {
    p_analisis_id: analisisId,
    p_pesos_actuales: pesosActuales,
    p_umbral_drift: umbralDrift,
  });
  if (error) {
    console.warn("Aviso al evaluar drift de portafolio:", error.message);
    return null;
  }
  return data;
}

/**
 * Confirma la ejecución de un rebalanceo y genera evento inmutable en bitácora.
 */
export async function confirmarEjecucionRebalanceo(revisionId) {
  if (!supabase) throw new Error(SIN_CUENTAS);
  const { data, error } = await supabase.rpc("confirmar_ejecucion_rebalanceo", {
    p_revision_id: revisionId,
  });
  if (error) throw new Error(error.message || "Error al confirmar rebalanceo.");
  return data;
}

/**
 * Obtiene la bitácora de auditoría inmutable para cumplimiento normativo (CNBV/LFPDPPP).
 */
export async function obtenerBitacoraAuditoria(limite = 50) {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("obtener_bitacora_auditoria", {
    p_limite: limite,
  });
  if (error) {
    console.warn("Aviso al obtener bitácora de auditoría:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Guarda atómicamente un mensaje del Asesor IA con snapshot de métricas patrimoniales.
 */
export async function guardarMensajeIA({
  conversacionId = null,
  rol,
  contenido,
  metricas = null,
  nuevoTitulo = null,
}) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("guardar_mensaje_ia", {
    p_conversacion_id: conversacionId,
    p_rol: rol,
    p_contenido: contenido,
    p_metricas: metricas,
    p_nuevo_titulo: nuevoTitulo,
  });
  if (error) {
    console.warn("Aviso al persistir mensaje de IA:", error.message);
    return null;
  }
  return data;
}

/**
 * Obtiene el historial completo de una conversación con el Asesor IA.
 */
export async function obtenerHistorialIA(conversacionId) {
  if (!supabase || !conversacionId) return [];
  const { data, error } = await supabase.rpc("obtener_historial_ia", {
    p_conversacion_id: conversacionId,
  });
  if (error) {
    console.warn("Aviso al obtener historial de IA:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Lista todas las sesiones de asesoría cuantitativa previas del usuario.
 */
export async function listarConversacionesIA() {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("listar_conversaciones_ia");
  if (error) {
    console.warn("Aviso al listar conversaciones de IA:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Genera alertas patrimoniales automáticas basadas en vencimientos y métricas.
 */
export async function generarAlertasAutomaticas() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("generar_alertas_automaticas");
  if (error) {
    console.warn("Aviso al generar alertas:", error.message);
    return null;
  }
  return data;
}

/**
 * Marca una alerta del sistema como atendida/leída.
 */
export async function marcarAlertaLeida(alertaId) {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("marcar_alerta_leida", {
    p_alerta_id: alertaId,
  });
  return !error && data?.success;
}

/**
 * Consulta la lista de alertas del sistema activas desde Supabase.
 */
export async function listarAlertasSistema() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("alertas_sistema")
    .select("*")
    .eq("leida", false)
    .order("creado_en", { ascending: false });
  if (error) {
    console.warn("Aviso al listar alertas del sistema:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * ==============================================================================
 * CAPACIDADES DE BANCA PRIVADA Y GESTIÓN DE RIESGO AVANZADA (FASE 2)
 * ==============================================================================
 */

/**
const ESCENARIOS_ESTRES_CATALOGO = [
  { codigo: "SHOCK_TASAS_BANXICO", nombre: "Shock de Tasas Banxico (+300 bps)", descripcion: "Endurecimiento de política monetaria con subida de +3.00% en la tasa de fondeo", resiliencia_esperada: "ALTA_RESILIENCIA" },
  { codigo: "DEVALUACION_USD_MXN", nombre: "Devaluación del Peso Mexicano (+25%)", descripcion: "Depreciación cambiaria severa que encarece insumos importados y energía", resiliencia_esperada: "COBERTURA_CAMBIARIA_TOTAL" },
  { codigo: "PICO_INFLACION_ALIMENTOS", nombre: "Pico de Inflación en Alimentos (+18%)", descripcion: "Shock agroalimentario por sequías y encarecimiento de granos y fertilizantes", resiliencia_esperada: "COBERTURA_ALIMENTARIA_ACTIVA" },
  { codigo: "ESTANFLACION_MEXICO", nombre: "Estanflación en México", descripcion: "Contracción del PIB con inflación persistente por encima del 7.5% anual", resiliencia_esperada: "MODERADA_RESILIENCIA" },
  { codigo: "CRASH_BURSATIL_GLOBAL", nombre: "Crash Bursátil Global (-35%)", descripcion: "Corrección severa de los mercados accionarios internacionales", resiliencia_esperada: "REFUGIO_SOBERANO_Y_ORO" }
];

/**
 * Ejecuta una prueba de estrés macroeconómica (vía Supabase RPC o motor FastAPI).
 */
export async function ejecutarEstresPortafolio(analisisId = null, codigoEscenario = "SHOCK_TASAS_BANXICO", pesos = null, weights = null) {
  if (supabase && analisisId) {
    try {
      const { data, error } = await supabase.rpc("ejecutar_estres_portafolio", {
        p_analisis_id: analisisId,
        p_codigo_escenario: codigoEscenario,
      });
      if (!error && data) return data;
    } catch (err) {
      console.warn("Aviso al ejecutar estrés en supabase:", err.message);
    }
  }

  // Fallback con ejecución directa en tiempo real contra el backend FastAPI
  try {
    const pGasto = pesos || { alimentos: 0.35, vivienda: 0.25, transporte: 0.15, salud: 0.10, educacion: 0.05, otros: 0.10 };
    const wOptimo = weights || [0.89, 0.10, 0.005, 0.005, 0, 0, 0, 0];
    const res = await simularEstres(pGasto, wOptimo);
    const esc = res.escenarios?.find(e => e.clave_escenario === codigoEscenario) || res.escenarios?.[0];

    if (esc) {
      return {
        escenario: {
          codigo: esc.clave_escenario,
          nombre: esc.nombre,
          descripcion: esc.descripcion,
          resiliencia_esperada: esc.resiliencia,
        },
        impacto: {
          rendimiento_cartera: esc.retorno_cartera_estres,
          rendimiento_pasivo: esc.retorno_pasivo_estres,
          delta_estresado: esc.delta_estresado,
          phe_estresado: esc.phe_estresado,
          recomendacion: esc.recomendacion,
        },
        resiliencia_global: res.resiliencia_promedio_cartera,
        escenario_mas_vulnerable: res.escenario_mas_vulnerable,
        escenario_mas_favorable: res.escenario_mas_favorable,
      };
    }
  } catch (err) {
    console.warn("Fallo motor FastAPI estres:", err);
  }
  return null;
}

/**
 * Lista los escenarios de estrés macroeconómicos oficiales.
 */
export async function listarEscenariosEstres() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("escenarios_estres")
        .select("*")
        .order("codigo", { ascending: true });
      if (!error && data?.length > 0) return data;
    } catch (err) {
      console.warn("Aviso al listar escenarios de estrés en supabase:", err.message);
    }
  }
  return ESCENARIOS_ESTRES_CATALOGO;
}

/**
 * Proyecta la cascada de liquidez y buffer anti-liquidación mes a mes.
 */
export async function proyectarCascadaLiquidez(analisisId = null, gastoMensual = 35000, horizonteMeses = 24) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("proyectar_cascada_liquidez", {
    p_analisis_id: analisisId,
    p_gasto_mensual: gastoMensual,
    p_horizonte_meses: horizonteMeses,
  });
  if (error) {
    console.warn("Aviso al proyectar cascada de liquidez:", error.message);
    return null;
  }
  return data;
}

/**
 * Genera el Factsheet Institucional formal para comités de inversión y cumplimiento CNBV.
 */
export async function generarFactsheetInstitucional(analisisId = null) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("generar_factsheet_institucional", {
    p_analisis_id: analisisId,
  });
  if (error) {
    console.warn("Aviso al generar factsheet institucional:", error.message);
    return null;
  }
  return data;
}

/**
 * Descompone la volatilidad en presupuesto y contribución marginal al riesgo (MCR).
 */
export async function calcularPresupuestoRiesgo(analisisId = null) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("calcular_presupuesto_riesgo", {
    p_analisis_id: analisisId,
  });
  if (error) {
    console.warn("Aviso al calcular presupuesto de riesgo:", error.message);
    return null;
  }
  return data;
}



