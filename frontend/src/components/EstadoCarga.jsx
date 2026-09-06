export default function EstadoCarga({ mensaje = "Cargando…" }) {
  return (
    <div className="estado-carga" role="status">
      <span className="pulso" aria-hidden="true" />
      <span>{mensaje}</span>
    </div>
  );
}
