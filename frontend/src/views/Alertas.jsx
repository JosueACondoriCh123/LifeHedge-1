import { fmtFecha } from "../formato.js";

const ETIQUETAS_SEVERIDAD = {
  critico: "Urgente",
  aviso: "Atención",
  info: "Info",
};

export default function Alertas({ alertas, revision, onRevisar }) {
  const activas = alertas.filter((alerta) => alerta.severidad !== "info").length;

  return (
    <div className="vista">
      <div className="vista-encabezado">
        <h2>Alertas de rebalanceo</h2>
        {revision ? (
          <span className="badge-stale">Última revisión: {fmtFecha(revision.fecha)}</span>
        ) : null}
      </div>

      <p className="pie-metodo">
        Vigilamos tres desvíos contra tu última revisión: el delta de divergencia (1 punto
        porcentual), tu canasta de gasto (2 puntos) y los pesos de la cartera óptima (3
        puntos). Todo se guarda en tu navegador.
      </p>

      {activas === 0 && revision ? (
        <section className="panel" aria-label="Sin alertas activas">
          <h3>Todo en orden</h3>
          <p className="metrica-nota">
            Ningún desvío supera los umbrales desde tu última revisión.
          </p>
        </section>
      ) : (
        <ul className="lista-alertas">
          {alertas.map((alerta) => (
            <li key={alerta.id} className={`alerta-tarjeta severidad-${alerta.severidad}`}>
              <span className="alerta-severidad">
                {ETIQUETAS_SEVERIDAD[alerta.severidad]}
              </span>
              <div className="alerta-cuerpo">
                <h3>{alerta.titulo}</h3>
                <p>{alerta.detalle}</p>
                {alerta.accion ? (
                  <p className="alerta-accion">Sugerencia: {alerta.accion}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="panel panel-revision" aria-label="Guardar revisión">
        <h3>¿Ya atendiste tus alertas?</h3>
        <p className="metrica-nota">
          Al marcar la revisión, tu estado actual se vuelve la nueva referencia para
          detectar desvíos.
        </p>
        <button type="button" className="boton-primario" onClick={onRevisar}>
          Marcar como revisado hoy
        </button>
      </section>
    </div>
  );
}
