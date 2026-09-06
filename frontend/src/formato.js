const porcentaje = new Intl.NumberFormat("es-MX", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const porcentajeDetallado = new Intl.NumberFormat("es-MX", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fechaLarga = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const moneda = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const fmtPct = (v) => porcentaje.format(v);

export const fmtPctDetallado = (v) => porcentajeDetallado.format(v);

export const fmtPctConSigno = (v) =>
  v > 0 ? `+${porcentajeDetallado.format(v)}` : `−${porcentajeDetallado.format(Math.abs(v))}`;

export const fmtPuntos = (v) => `${Math.round(v * 100)} puntos`;

export const fmtRatio = (v) => (typeof v === "number" ? v.toFixed(3) : "—");

export const fmtMoneda = (v) => (typeof v === "number" ? moneda.format(v) : "—");

export const fmtFecha = (iso) => {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? "" : fechaLarga.format(fecha);
};
