export const TICKERS = [
  "UDIBONO",
  "CETES28",
  "NAFTRACISHRS.MX",
  "IVVPESOISHRS.MX",
  "GLD",
  "XLE",
  "DBA",
  "MXN=X",
];

export const TICKER_LABELS = {
  "UDIBONO": "Udibonos",
  "CETES28": "Cetes 28d",
  "NAFTRACISHRS.MX": "IPC",
  "IVVPESOISHRS.MX": "S&P 500 (MXN)",
  "GLD": "Oro",
  "XLE": "Energía",
  "DBA": "Agro",
  "MXN=X": "USD/MXN",
};

const UMBRAL_OTROS = 0.005;

export function filasCartera(optimo) {
  const filas = optimo.assets
    .map((activo, i) => ({ ...activo, peso: optimo.weights[i] }))
    .sort((a, b) => b.peso - a.peso);
  const principales = filas.filter((f) => f.peso >= UMBRAL_OTROS);
  const resto = filas.filter((f) => f.peso < UMBRAL_OTROS);
  if (resto.length > 0) {
    principales.push({
      label: "Otros",
      ticker: "—",
      peso: resto.reduce((s, f) => s + f.peso, 0),
    });
  }
  return principales;
}
