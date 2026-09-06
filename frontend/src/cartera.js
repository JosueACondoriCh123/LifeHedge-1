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
