import { useEffect, useState, useMemo } from "react";
import { fmtFecha, fmtPct, fmtPctConSigno } from "../formato.js";
import {
  calcularScorePatrimonial,
  evaluarDriftPortafolio,
  confirmarEjecucionRebalanceo,
  obtenerBenchmarksComparativos,
  generarAlertasAutomaticas,
  marcarAlertaLeida,
  listarAlertasSistema,
} from "../datos/analisis.js";

const ETIQUETAS_SEVERIDAD = {
  critico: "Urgente",
  danger: "Urgente",
  urgente: "Urgente",
  aviso: "Atención",
  warning: "Atención",
  atencion: "Atención",
  info: "Informativo",
  informativo: "Informativo",
  success: "Óptimo",
};

export default function Alertas({ alertas: alertasLocales = [], revision, onRevisar, datos, onIr }) {
  const [scoreLDI, setScoreLDI] = useState(null);
  const [benchmarks, setBenchmarks] = useState(null);
  const [evaluacionDrift, setEvaluacionDrift] = useState(null);
  const [rebalanceando, setRebalanceando] = useState(false);
  const [rebalanceoExito, setRebalanceoExito] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Alertas dinámicas y persistentes desde Supabase
  const [alertasDB, setAlertasDB] = useState([]);
  const [atendidasIds, setAtendidasIds] = useState(new Set());
  const [filtroSeveridad, setFiltroSeveridad] = useState("todas");
  const [feedbackAlerta, setFeedbackAlerta] = useState(null);

  // Cargar métricas institucionales y alertas de Supabase
  useEffect(() => {
    let activo = true;
    async function cargarMetricasYAlertas() {
      setCargando(true);
      try {
        const [resScore, resBench, resGen, resList] = await Promise.all([
          calcularScorePatrimonial(),
          obtenerBenchmarksComparativos(),
          generarAlertasAutomaticas().catch(() => null),
          listarAlertasSistema().catch(() => []),
        ]);
        if (activo) {
          if (resScore?.tiene_analisis) setScoreLDI(resScore);
          if (resBench?.benchmarks) setBenchmarks(resBench);

          const combinadas = [];
          if (Array.isArray(resList) && resList.length > 0) {
            combinadas.push(...resList);
          }
          if (Array.isArray(resGen?.alertas)) {
            resGen.alertas.forEach((a) => {
              if (!combinadas.some((c) => c.id === a.id || (c.titulo === a.titulo && c.tipo === a.tipo))) {
                combinadas.push(a);
              }
            });
          }
          setAlertasDB(combinadas);
        }
      } catch (err) {
        console.warn("Error cargando métricas o alertas institucionales:", err);
      } finally {
        if (activo) setCargando(false);
      }
    }
    cargarMetricasYAlertas();
    return () => {
      activo = false;
    };
  }, []);

  // Evaluar drift si tenemos datos y un análisis previo
  const handleEvaluarDrift = async () => {
    if (!datos?.optimo?.weights || !scoreLDI?.analisis_id) return;
    try {
      const tickers = datos.optimo.assets?.map((a) => a.ticker) || [
        "UDIBONO", "BONOS_M", "CETES", "FIBRAS", "SP500_H", "ORO", "FIBRAS_LOG", "EFECTIVO"
      ];
      const pesosObj = {};
      tickers.forEach((t, idx) => {
        pesosObj[t] = datos.optimo.weights[idx] ?? 0;
      });

      const resDrift = await evaluarDriftPortafolio(scoreLDI.analisis_id, pesosObj, 0.05);
      if (resDrift) setEvaluacionDrift(resDrift);
    } catch (err) {
      console.warn("Error al evaluar drift:", err);
    }
  };

  const handleEjecutarRebalanceo = async () => {
    if (!evaluacionDrift?.revision_id) return;
    setRebalanceando(true);
    setRebalanceoExito(null);
    try {
      await confirmarEjecucionRebalanceo(evaluacionDrift.revision_id);
      setRebalanceoExito("Rebalanceo confirmado y registrado en la bitácora inmutable de auditoría CNBV.");
      if (onRevisar) onRevisar();
    } catch (err) {
      setRebalanceoExito(`Error: ${err.message}`);
    } finally {
      setRebalanceando(false);
    }
  };

  // Combinar alertas locales y alertas persistentes de Supabase
  const todasLasAlertas = useMemo(() => {
    const mapa = new Map();

    // Locales
    alertasLocales.forEach((a) => {
      const id = a.id || `loc-${a.titulo}`;
      mapa.set(id, {
        id,
        titulo: a.titulo,
        detalle: a.detalle,
        severidad: a.severidad || "aviso",
        accion: a.accion,
        origen: "local",
      });
    });

    // Supabase
    alertasDB.forEach((a) => {
      const id = a.id || `srv-${a.titulo}`;
      if (!mapa.has(id)) {
        mapa.set(id, {
          id,
          titulo: a.titulo,
          detalle: a.mensaje || a.detalle,
          severidad: a.severidad || "aviso",
          accion: a.accion_sugerida || (a.tipo === "DRIFT" ? "Revisar desvío y rebalancear en corretaje" : "Revisar vencimientos de bonos"),
          origen: "supabase",
        });
      }
    });

    return Array.from(mapa.values()).filter((a) => !atendidasIds.has(a.id));
  }, [alertasLocales, alertasDB, atendidasIds]);

  const alertasFiltradas = useMemo(() => {
    if (filtroSeveridad === "todas") return todasLasAlertas;
    if (filtroSeveridad === "urgente") {
      return todasLasAlertas.filter((a) => ["critico", "danger", "urgente"].includes(a.severidad));
    }
    if (filtroSeveridad === "atencion") {
      return todasLasAlertas.filter((a) => ["aviso", "warning", "atencion"].includes(a.severidad));
    }
    if (filtroSeveridad === "informativo") {
      return todasLasAlertas.filter((a) => ["info", "success", "informativo"].includes(a.severidad));
    }
    return todasLasAlertas;
  }, [todasLasAlertas, filtroSeveridad]);

  const activas = todasLasAlertas.filter((a) => a.severidad !== "info" && a.severidad !== "informativo").length;

  const handleAtenderAlerta = async (alerta) => {
    setAtendidasIds((prev) => new Set([...prev, alerta.id]));
    setFeedbackAlerta(`Alerta "${alerta.titulo}" marcada como atendida.`);
    setTimeout(() => setFeedbackAlerta(null), 3500);

    if (alerta.origen === "supabase" && alerta.id && typeof alerta.id === "string" && !alerta.id.startsWith("srv-")) {
      try {
        await marcarAlertaLeida(alerta.id);
      } catch (e) {
        console.warn("Aviso al marcar alerta leída en Supabase:", e);
      }
    }
  };

  const handleAtenderTodas = async () => {
    const ids = todasLasAlertas.map((a) => a.id);
    setAtendidasIds((prev) => new Set([...prev, ...ids]));
    setFeedbackAlerta("Todas las alertas han sido atendidas satisfactoriamente.");
    setTimeout(() => setFeedbackAlerta(null), 3500);

    for (const a of todasLasAlertas) {
      if (a.origen === "supabase" && a.id && typeof a.id === "string" && !a.id.startsWith("srv-")) {
        marcarAlertaLeida(a.id).catch(() => {});
      }
    }
    if (onRevisar) onRevisar();
  };

  return (
    <div className="vista">
      <div className="vista-encabezado">
        <div>
          <div className="badge-seccion-neon">
            MONITOREO DE CARTERA & CUMPLIMIENTO INSTITUCIONAL
          </div>
          <h2>Alertas y Rebalanceo LDI</h2>
          <p className="subtitulo-vista">
            Detección de desvíos en base de datos, calificación de inmunización patrimonial y benchmarks mexicanos.
          </p>
        </div>
        {revision ? (
          <span className="badge-stale">Última revisión: {fmtFecha(revision.fecha)}</span>
        ) : null}
      </div>

      {/* 1. SCORE PATRIMONIAL INSTITUCIONAL (PL/pgSQL en Supabase) */}
      {scoreLDI && (
        <section className="panel" style={{ borderLeft: "4px solid #10b981", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "1px", color: "var(--color-texto-apagado)" }}>
                LifeHedge Health Rating · Motor PL/pgSQL
              </span>
              <h3 style={{ margin: "4px 0", fontSize: "1.3rem" }}>
                Calificación Institucional: <span style={{ color: "#10b981", fontWeight: "bold" }}>{scoreLDI.calificacion}</span> ({scoreLDI.score_total}/100 pts)
              </h3>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.9rem", color: "var(--color-texto-apagado)", maxWidth: "600px" }}>
                {scoreLDI.diagnostico}
              </p>
            </div>
            <div style={{ display: "flex", gap: "12px", textAlign: "center" }}>
              <div style={{ background: "rgba(255,255,255,0.04)", padding: "8px 14px", borderRadius: "8px" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--color-texto-apagado)" }}>PHE Cobertura</div>
                <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#10b981" }}>
                  {scoreLDI.pilares?.cobertura_phe?.puntaje}/40
                </div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.04)", padding: "8px 14px", borderRadius: "8px" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--color-texto-apagado)" }}>Delta Real</div>
                <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#38bdf8" }}>
                  {scoreLDI.pilares?.rendimiento_delta?.puntaje}/25
                </div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.04)", padding: "8px 14px", borderRadius: "8px" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--color-texto-apagado)" }}>TEV Estabilidad</div>
                <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#a855f7" }}>
                  {scoreLDI.pilares?.tracking_error_tev?.puntaje}/20
                </div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.04)", padding: "8px 14px", borderRadius: "8px" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--color-texto-apagado)" }}>HHI Diversif.</div>
                <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#eab308" }}>
                  {scoreLDI.pilares?.diversificacion_hhi?.puntaje}/15
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 2. CORREDOR DE DESVÍO Y REBALANCEO (DRIFT MONITORING) */}
      <section className="panel" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div>
            <h3 style={{ margin: 0 }}>Monitoreo de Corredor de Desvío (Tolerance Drift)</h3>
            <p className="metrica-nota" style={{ margin: "4px 0 0 0" }}>
              Tolerancia estándar: ±5% por activo. Evita sobre-operar la cuenta y reduce comisiones de corretaje.
            </p>
          </div>
          <button
            type="button"
            className="boton-secundario"
            onClick={handleEvaluarDrift}
            disabled={!scoreLDI?.analisis_id}
          >
            Evaluar Desvío en Base de Datos
          </button>
        </div>

        {evaluacionDrift && (
          <div style={{ marginTop: "16px", background: "rgba(255,255,255,0.02)", padding: "16px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div>
                <strong>Estado del Rebalanceo: </strong>
                {evaluacionDrift.requiere_rebalanceo ? (
                  <span style={{ color: "#ef4444", fontWeight: "bold" }}>
                    Rebalanceo Requerido (Desvío máximo: {(evaluacionDrift.max_desvio * 100).toFixed(1)}% en {evaluacionDrift.activo_max_desvio})
                  </span>
                ) : (
                  <span style={{ color: "#10b981", fontWeight: "bold" }}>
                    Dentro del corredor de tolerancia (Máx: {(evaluacionDrift.max_desvio * 100).toFixed(1)}%)
                  </span>
                )}
              </div>
              {evaluacionDrift.requiere_rebalanceo && (
                <button
                  type="button"
                  className="boton-primario"
                  onClick={handleEjecutarRebalanceo}
                  disabled={rebalanceando}
                >
                  {rebalanceando ? "Registrando…" : "Confirmar y Auditar Rebalanceo"}
                </button>
              )}
            </div>

            {rebalanceoExito && (
              <div style={{ padding: "10px", background: "rgba(16,185,129,0.15)", borderRadius: "6px", color: "#10b981", fontSize: "0.88rem", marginBottom: "12px" }}>
                {rebalanceoExito}
              </div>
            )}

            {evaluacionDrift.desglose?.length > 0 && (
              <div className="tabla-desplazable">
                <table className="tabla" style={{ fontSize: "0.85rem" }}>
                  <thead>
                    <tr>
                      <th>Activo</th>
                      <th>Ponderación Objetivo</th>
                      <th>Ponderación Actual</th>
                      <th>Desvío Absoluto</th>
                      <th>Variación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evaluacionDrift.desglose.map((d) => (
                      <tr key={d.activo}>
                        <td><strong>{d.activo}</strong></td>
                        <td>{fmtPct(d.peso_objetivo)}</td>
                        <td>{fmtPct(d.peso_actual)}</td>
                        <td>{(d.desvio_absoluto * 100).toFixed(1)}%</td>
                        <td style={{ color: d.desvio_porcentual > 0 ? "#10b981" : d.desvio_porcentual < 0 ? "#ef4444" : "inherit" }}>
                          {d.desvio_porcentual > 0 ? `+${d.desvio_porcentual}%` : `${d.desvio_porcentual}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. BENCHMARKS DEL MERCADO MEXICANO (BANXICO & CONSAR) */}
      {benchmarks?.benchmarks?.length > 0 && (
        <section className="panel" style={{ marginBottom: "20px" }}>
          <h3>Comparativa con Benchmarks Institucionales Mexicanos</h3>
          <p className="metrica-nota" style={{ margin: "4px 0 14px 0" }}>
            Cálculo en base de datos del rendimiento excedente (Alpha) y spread de cobertura frente al mercado oficial.
          </p>

          <div className="tabla-desplazable">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Índice / Referencia</th>
                  <th>Categoría</th>
                  <th>Rendimiento Anual</th>
                  <th>Sharpe</th>
                  <th>Cobertura INPC</th>
                  <th>Alpha Generado</th>
                  <th>Spread de Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {benchmarks.benchmarks.map((b) => (
                  <tr key={b.codigo}>
                    <td>
                      <strong>{b.nombre}</strong>
                    </td>
                    <td><span className="tag-rubro">{b.categoria}</span></td>
                    <td>{fmtPct(b.rendimiento_anual)}</td>
                    <td>{b.sharpe_ratio}</td>
                    <td>{fmtPct(b.cobertura_inpc)}</td>
                    <td style={{ color: b.alpha_generado >= 0 ? "#10b981" : "#ef4444", fontWeight: "bold" }}>
                      {b.alpha_generado >= 0 ? `+${b.alpha_generado}%` : `${b.alpha_generado}%`}
                    </td>
                    <td style={{ color: b.spread_cobertura >= 0 ? "#10b981" : "#ef4444", fontWeight: "bold" }}>
                      {b.spread_cobertura >= 0 ? `+${b.spread_cobertura}%` : `${b.spread_cobertura}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 4. ALERTAS ACTIVAS DEL SISTEMA */}
      <section className="panel" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "14px" }}>
          <div>
            <h3 style={{ margin: 0 }}>Alertas Patrimoniales Activas</h3>
            <p className="metrica-nota" style={{ margin: "2px 0 0 0" }}>
              Monitoreo continuo de desvíos en pesos, pérdida de poder de compra y vencimientos.
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            {/* Filtros de severidad */}
            <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: "8px", padding: "3px" }}>
              {[
                { clave: "todas", etiqueta: `Todas (${todasLasAlertas.length})` },
                { clave: "urgente", etiqueta: "Urgentes" },
                { clave: "atencion", etiqueta: "Atención" },
                { clave: "informativo", etiqueta: "Informativas" },
              ].map((f) => (
                <button
                  key={f.clave}
                  type="button"
                  onClick={() => setFiltroSeveridad(f.clave)}
                  style={{
                    background: filtroSeveridad === f.clave ? "rgba(56,189,248,0.2)" : "transparent",
                    color: filtroSeveridad === f.clave ? "#38bdf8" : "var(--color-texto-apagado)",
                    border: "none",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    fontWeight: filtroSeveridad === f.clave ? "bold" : "normal",
                  }}
                >
                  {f.etiqueta}
                </button>
              ))}
            </div>

            {todasLasAlertas.length > 0 && (
              <button
                type="button"
                className="boton-secundario"
                onClick={handleAtenderTodas}
                style={{ fontSize: "0.82rem", padding: "6px 12px" }}
              >
                Atender Todas
              </button>
            )}
          </div>
        </div>

        {feedbackAlerta && (
          <div style={{ padding: "8px 14px", background: "rgba(16,185,129,0.15)", borderRadius: "6px", color: "#10b981", fontSize: "0.85rem", marginBottom: "12px", border: "1px solid rgba(16,185,129,0.25)" }}>
            {feedbackAlerta}
          </div>
        )}

        {alertasFiltradas.length === 0 ? (
          <div className="panel" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", marginTop: "10px" }}>
            <h4 style={{ margin: 0, color: "#10b981" }}>Todo en orden</h4>
            <p className="metrica-nota" style={{ margin: "4px 0 0 0" }}>
              {filtroSeveridad === "todas"
                ? "No tienes alertas pendientes en este momento. Tu portafolio cumple con las tolerancias LDI."
                : `No hay alertas con severidad "${filtroSeveridad}".`}
            </p>
          </div>
        ) : (
          <ul className="lista-alertas" style={{ marginTop: "12px" }}>
            {alertasFiltradas.map((alerta) => {
              const textoBuscador = `${alerta.titulo} ${alerta.detalle}`.toLowerCase();
              let atajo = null;
              if (textoBuscador.includes("rebalanceo") || textoBuscador.includes("drift") || textoBuscador.includes("orden")) {
                atajo = { etiqueta: "Ir a Órdenes", vista: "frontera" };
              } else if (textoBuscador.includes("inflación") || textoBuscador.includes("canasta") || textoBuscador.includes("gasto")) {
                atajo = { etiqueta: "Ajustar Canasta", vista: "transacciones" };
              } else if (textoBuscador.includes("estrés") || textoBuscador.includes("shock")) {
                atajo = { etiqueta: "Prueba de Estrés", vista: "simulador" };
              } else if (textoBuscador.includes("cobertura") || textoBuscador.includes("inmunización") || textoBuscador.includes("phe")) {
                atajo = { etiqueta: "Ver Cobertura", vista: "cobertura" };
              }

              return (
                <li key={alerta.id} className={`alerta-tarjeta severidad-${alerta.severidad}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
                  <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", flex: 1 }}>
                    <span className="alerta-severidad">
                      {ETIQUETAS_SEVERIDAD[alerta.severidad] || alerta.severidad}
                    </span>
                    <div className="alerta-cuerpo">
                      <h3 style={{ margin: "0 0 4px 0" }}>{alerta.titulo}</h3>
                      <p style={{ margin: "0 0 6px 0" }}>{alerta.detalle}</p>
                      {alerta.accion ? (
                        <p className="alerta-accion" style={{ margin: 0 }}>Sugerencia: {alerta.accion}</p>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
                    {atajo && onIr && (
                      <button
                        type="button"
                        className="boton-secundario"
                        onClick={() => onIr(atajo.vista)}
                        style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                      >
                        {atajo.etiqueta} →
                      </button>
                    )}
                    <button
                      type="button"
                      className="boton-primario"
                      onClick={() => handleAtenderAlerta(alerta)}
                      style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                    >
                      Atendida
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 5. CONFIRMACIÓN DE REVISIÓN */}
      <section className="panel panel-revision" aria-label="Guardar revisión">
        <h3>¿Ya atendiste tus alertas y ajustes?</h3>
        <p className="metrica-nota">
          Al marcar la revisión, tu estado actual se vuelve la nueva referencia temporal para detectar desvíos.
        </p>
        <button type="button" className="boton-primario" onClick={onRevisar}>
          Marcar como revisado hoy
        </button>
      </section>
    </div>
  );
}
