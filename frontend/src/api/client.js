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
    // Token vencido o inválido: no tiene sentido reintentar ni mostrar el
    // dashboard con datos que ya no se pueden refrescar.
    alPerderSesion();
    throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
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

export const getUniverse = () => pedir("/market/universe");

export function parseStatement(file) {
  const datos = new FormData();
  datos.append("archivo", file); // el backend espera este nombre exacto
  return pedir("/statement/parse", { method: "POST", body: datos });
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

