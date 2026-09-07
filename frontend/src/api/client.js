import { alPerderSesion, encabezadosAuth } from "../auth/token.js";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const TIEMPO_MAX_WARMUP_MS = 90_000;
const INTERVALO_WARMUP_MS = 2_000;

function mensajeDeError(cuerpo) {
  const detail = cuerpo?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    // Error de validación de Pydantic: arreglo de objetos, no apto para mostrar tal cual.
    return "Revisa los datos enviados: alguno está fuera del rango permitido.";
  }
  return "El motor no pudo procesar la solicitud.";
}

async function pedir(ruta, opciones = {}) {
  // El token lo aporta auth/token.js, que es del Agente C. Mientras siga
  // devolviendo {} la app funciona sin cuentas, que es lo que permite que
  // el recorrido de demo no dependa de Supabase.
  const auth = await encabezadosAuth();

  let respuesta;
  try {
    respuesta = await fetch(`${BASE}${ruta}`, {
      ...opciones,
      headers: { ...(opciones.headers ?? {}), ...auth },
    });
  } catch {
    throw new Error("No pudimos contactar al motor. Revisa tu conexión.");
  }

  if (respuesta.status === 401) {
    // Token vencido o inválido: sólo desloguear si no es una petición silenciosa
    if (!opciones.silencioso) {
      alPerderSesion();
    }
    throw new Error("Se requiere inicio de sesión para esta consulta.");
  }

  if (!respuesta.ok) {
    let cuerpo = null;
    try {
      cuerpo = await respuesta.json();
    } catch {
      // respuesta sin JSON
    }
    throw new Error(mensajeDeError(cuerpo));
  }
  return respuesta.json();
}

function json(cuerpo) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  };
}

/** Espera a que el backend responda. Devuelve false si nunca despertó. */
export async function esperarBackend() {
  const limite = Date.now() + TIEMPO_MAX_WARMUP_MS;
  while (Date.now() < limite) {
    try {
      const respuesta = await fetch(`${BASE}/health`);
      if (respuesta.ok) return true;
    } catch {
      // el servicio sigue despertando
    }
    await new Promise((r) => setTimeout(r, INTERVALO_WARMUP_MS));
  }
  return false;
}

export const getUniverse = () => pedir("/market/universe", { silencioso: true });

export function parseStatement(file, useAi = false) {
  const datos = new FormData();
  datos.append("archivo", file); // el backend espera este nombre exacto
  return pedir(`/statement/parse?use_ai=${Boolean(useAi)}`, { method: "POST", body: datos });
}

export const getInflacion = (pesos) => pedir("/inflation/personal", json({ pesos }));

export const optimizar = (pesos, buffer = 0.1) =>
  pedir("/portfolio/optimize", json({ pesos, buffer }));

export const simular = (pesos, weights, horizonte = 12) =>
  pedir("/risk/simulate", json({ pesos, weights, horizonte }));

/**
 * Puebla el dashboard completo en un solo viaje de red.
 *
 * Antes eran tres llamadas encadenadas —simular depende de los pesos que
 * devuelve optimizar—, y con el arranque en frío de Render eso triplicaba
 * tanto la espera como la probabilidad de fallar a media carga.
 */
export const calcularTodo = async (pesos, buffer = 0.1, horizonte = 12) => {
  const data = await pedir("/analysis/run", json({ pesos, buffer, horizonte }));
  return { ...data, pesos };
};

/* --- Feeds Oficiales Banxico & INEGI --- */
export const getBanxicoResumen = () => pedir("/api/banxico/resumen");
export const getBanxicoSerie = (serieId) => pedir(`/api/banxico/series/${serieId}`);
export const getBanxicoCatalogo = () => pedir("/api/banxico/catalogo");
export const getInegiResumen = () => pedir("/api/inegi/resumen");
export const getInegiInpc = () => pedir("/api/inegi/inpc");
export const getInegiIndicador = (indicadorId) => pedir(`/api/inegi/indicador/${indicadorId}`);
export const getInegiCatalogo = () => pedir("/api/inegi/catalogo");
export const getFuentesEstado = () => pedir("/api/fuentes/estado");

/* --- Motores Cuantitativos Avanzados LifeHedge --- */
export const rebalancearCartera = (capitalTotal, portafolioActual, targetWeights, comisionPct = 0.0025, umbralDrift = 0.05) =>
  pedir("/portfolio/rebalance", json({
    capital_total: capitalTotal,
    portafolio_actual: portafolioActual,
    target_weights: targetWeights,
    comision_broker_pct: comisionPct,
    umbral_drift: umbralDrift,
  }));

export const ejecutarBacktest = (pesos, optimalWeights, mesesVentana = 36) =>
  pedir("/portfolio/backtest", json({
    pesos,
    optimal_weights: optimalWeights,
    meses_ventana: mesesVentana,
  }));

export const simularEstres = (pesos, optimalWeights) =>
  pedir("/stress/simulate", json({
    pesos,
    optimal_weights: optimalWeights,
  }));

export const getStatementInsights = (transacciones, umbralHormiga = 120.0) =>
  pedir("/statement/insights", json({
    transacciones,
    umbral_hormiga: umbralHormiga,
  }));

export const getReporteEjecutivo = (pesos, capitalTotal = 100000, buffer = 0.1, horizonte = 12, transacciones = []) =>
  pedir("/report/executive", json({
    pesos,
    capital_total: capitalTotal,
    buffer,
    horizonte,
    transacciones,
  }));

export const getSystemDiagnostics = () => pedir("/system/diagnostics");

/* --- Acoplamiento Dinámico, Cartera Base INEGI y Ping en Vivo --- */
export const getMatrizAcoplamiento = () => pedir("/market/coupling");
export const getCarteraBase = (buffer = 0.1, horizonte = 12) =>
  pedir(`/portfolio/baseline?buffer=${buffer}&horizonte=${horizonte}`);
export const getDiagnosticoPing = () => pedir("/api/diagnostico/ping");
export const getComparativeScenarios = (buffer = 0.1, horizonte = 12) =>
  pedir(`/scenarios/comparative?buffer=${buffer}&horizonte=${horizonte}`);


