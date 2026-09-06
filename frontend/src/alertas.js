import { fmtPct, fmtPuntos } from "./formato.js";
import { ETIQUETAS_RUBRO } from "./rubros.js";

const CLAVE_REVISION = "lifehedge.revision";

const UMBRAL_DELTA = 0.01;
const UMBRAL_CANASTA = 0.02;
const UMBRAL_PESOS = 0.03;
const DIAS_REVISION = 30;

const RANGO_SEVERIDAD = { critico: 0, aviso: 1, info: 2 };

export function guardarRevision(snapshot) {
  localStorage.setItem(CLAVE_REVISION, JSON.stringify(snapshot));
}

export function leerRevision() {
  try {
    const bruto = localStorage.getItem(CLAVE_REVISION);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

export function calcularAlertas(datos, revision) {
  if (!revision) {
    return [
      {
        id: "sin-revision",
        severidad: "info",
        titulo: "Aún no guardas tu primera revisión",
        detalle:
          "Las alertas comparan tu situación actual contra la última revisión que guardes en este navegador.",
        accion: "Pulsa «Marcar como revisado hoy» para fijar tu punto de partida.",
      },
    ];
  }

  const alertas = [];

  const dias = Math.floor((Date.now() - new Date(revision.fecha).getTime()) / 86_400_000);
  if (dias >= DIAS_REVISION) {
    alertas.push({
      id: "revision-antigua",
      severidad: "aviso",
      titulo: `Tu última revisión fue hace ${dias} días`,
      detalle: "Los mercados y tus gastos pudieron cambiar desde entonces.",
      accion: "Recalcula tu cartera y guarda una nueva revisión.",
    });
  }

  const cambioDelta = datos.inflacion.delta_anualizado - revision.delta;
  if (Math.abs(cambioDelta) >= UMBRAL_DELTA) {
    alertas.push({
      id: "delta-divergencia",
      severidad: Math.abs(cambioDelta) >= UMBRAL_DELTA * 2 ? "critico" : "aviso",
      titulo: "Tu delta de divergencia cambió",
      detalle: `Pasó de ${fmtPct(revision.delta)} a ${fmtPct(datos.inflacion.delta_anualizado)} (${
        cambioDelta > 0 ? "+" : ""
      }${fmtPuntos(cambioDelta)}).`,
      accion: "Revisa la pestaña Cobertura: tu cartera podría necesitar rebalanceo.",
    });
  }

  const cambiosCanasta = Object.keys(revision.pesos ?? {})
    .map((rubro) => ({
      rubro,
      cambio: (datos.pesos[rubro] ?? 0) - (revision.pesos[rubro] ?? 0),
    }))
    .filter(({ cambio }) => Math.abs(cambio) >= UMBRAL_CANASTA)
    .sort((a, b) => Math.abs(b.cambio) - Math.abs(a.cambio));
  if (cambiosCanasta.length > 0) {
    const { rubro, cambio } = cambiosCanasta[0];
    alertas.push({
      id: "canasta",
      severidad: "aviso",
      titulo: "Tu canasta de gasto se movió",
      detalle: `${ETIQUETAS_RUBRO[rubro] ?? rubro} cambió ${
        cambio > 0 ? "+" : ""
      }${fmtPuntos(cambio)} desde tu última revisión.`,
      accion: "Recalcula tu inflación y tu cartera con la canasta actualizada.",
    });
  }

  const pesosActuales = datos.optimo.weights;
  const pesosPrevios = revision.weights;
  if (Array.isArray(pesosActuales) && Array.isArray(pesosPrevios)) {
    if (pesosActuales.length !== pesosPrevios.length) {
      alertas.push({
        id: "universo",
        severidad: "aviso",
        titulo: "El universo de activos cambió",
        detalle:
          "Los activos disponibles son distintos a los de tu última revisión.",
        accion: "Revisa la nueva cartera óptima en la pestaña Cobertura.",
      });
    } else {
      const cambios = pesosActuales.map((peso, i) => ({
        activo:
          datos.optimo.assets[i]?.label ??
          datos.optimo.assets[i]?.ticker ??
          `Activo ${i + 1}`,
        anterior: pesosPrevios[i] ?? 0,
        actual: peso,
        cambio: peso - (pesosPrevios[i] ?? 0),
      }));
      const mayor = cambios.reduce((a, b) =>
        Math.abs(b.cambio) > Math.abs(a.cambio) ? b : a
      );
      if (Math.abs(mayor.cambio) >= UMBRAL_PESOS) {
        alertas.push({
          id: "cartera",
          severidad: Math.abs(mayor.cambio) >= UMBRAL_PESOS * 2 ? "critico" : "aviso",
          titulo: "La cartera óptima se desvió de tu última revisión",
          detalle: `${mayor.activo} pasó de ${fmtPct(mayor.anterior)} a ${fmtPct(
            mayor.actual
          )} de la cartera.`,
          accion: "Compara la composición en Cobertura y rebalancea hacia los nuevos pesos.",
        });
      }
    }
  }

  return alertas.sort(
    (a, b) => RANGO_SEVERIDAD[a.severidad] - RANGO_SEVERIDAD[b.severidad]
  );
}
