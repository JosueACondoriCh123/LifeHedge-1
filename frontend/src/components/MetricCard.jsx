export default function MetricCard({ etiqueta, valor, nota, tono = "neutro", destacada = false }) {
  return (
    <div className={`metrica tono-${tono}${destacada ? " destacada" : ""}`}>
      <span className="metrica-etiqueta">{etiqueta}</span>
      <span className="metrica-valor">{valor}</span>
      {nota ? <span className="metrica-nota">{nota}</span> : null}
    </div>
  );
}
