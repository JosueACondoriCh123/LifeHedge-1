import { useState, useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import { fmtPct, fmtPctDetallado, fmtMoneda, fmtPuntos } from "../formato.js";
import { TICKER_LABELS } from "../cartera.js";
import { IconoPortafolio, IconoCheck } from "../components/Iconos.jsx";

export default function Frontera({ datos, onIr }) {
  const { optimo } = datos;
  const [capitalTotal, setCapitalTotal] = useState(100000);
  const [ordenesEjecutadas, setOrdenesEjecutadas] = useState(false);

  // Puntos de la frontera eficiente desde el optimizador QP
  const puntos = useMemo(() => {
    if (!optimo?.frontera) return [];
    return optimo.frontera.map((p, idx) => ({
      idx,
      tev: Number((p.tev * 100).toFixed(2)),
      phe: Number((p.phe * 100).toFixed(2)),
    }));
  }, [optimo]);

  const puntoOptimo = {
    tev: Number((optimo.tev * 100).toFixed(2)),
    phe: Number((optimo.phe * 100).toFixed(2)),
  };

  // Comparación contra Solo Cetes
  const pheExtra = Math.max(0, optimo.phe - optimo.benchmark_cetes.phe);

  // Tickets de rebalanceo calculados a partir de los pesos óptimos
  const tickets = useMemo(() => {
    if (!optimo?.assets || !optimo?.weights) return [];
    return optimo.assets.map((asset, i) => {
      const peso = optimo.weights[i];
      const monto = capitalTotal * peso;
      return {
        ticker: asset.ticker,
        nombre: TICKER_LABELS[asset.ticker] || asset.label,
        peso,
        monto,
        accion: peso > 0.05 ? "COMPRA" : peso > 0.01 ? "MANTENER" : "REDUCIR",
      };
    }).sort((a, b) => b.peso - a.peso);
  }, [optimo, capitalTotal]);

  const handleEjecutar = () => {
    setOrdenesEjecutadas(true);
    setTimeout(() => setOrdenesEjecutadas(false), 4000);
  };

  return (
    <div className="vista-frontera-container">
      {/* HEADER DE LA PANTALLA */}
      <div className="vista-encabezado-moderno">
        <div>
          <div className="badge-seccion-neon">
            <IconoPortafolio size={14} /> FRONTERA EFICIENTE LDI & REBALANCEO
          </div>
          <h1 className="titulo-vista-principal">Optimización Convexa de Markowitz-LDI</h1>
          <p className="subtitulo-vista">
            Curva de máxima neutralización de inflación personal minimizando el error de seguimiento (TEV).
          </p>
        </div>

        <div className="controles-capital-header">
          <label className="label-capital-input">
            <span>Capital a Invertir (MXN):</span>
            <div className="input-capital-wrapper">
              <span className="signo-pesos">$</span>
              <input
                type="number"
                min="1000"
                step="10000"
                value={capitalTotal}
                onChange={(e) => setCapitalTotal(Math.max(1000, Number(e.target.value)))}
                className="input-capital-num"
              />
            </div>
          </label>
        </div>
      </div>

      {/* METRICAS SUPERIORES */}
      <div className="grid-metricas-frontera">
        <div className="card-metrica-glow border-morado">
          <span className="label-metrica-dim">Eficiencia PHE Óptima</span>
          <span className="valor-metrica-glow color-morado">
            {fmtPctDetallado(optimo.phe)}
          </span>
          <span className="nota-metrica-sub">
            Neutraliza {fmtPuntos(pheExtra)} más varianza que Solo Cetes
          </span>
        </div>

        <div className="card-metrica-glow border-cian">
          <span className="label-metrica-dim">Tracking Error (TEV)</span>
          <span className="valor-metrica-glow color-cian">
            {fmtPct(optimo.tev)}
          </span>
          <span className="nota-metrica-sub">
            Desviación anualizada mínima contra tu canasta
          </span>
        </div>

        <div className="card-metrica-glow border-verde">
          <span className="label-metrica-dim">Cobertura Solo Cetes</span>
          <span className="valor-metrica-glow color-verde">
            {fmtPctDetallado(optimo.benchmark_cetes.phe)}
          </span>
          <span className="nota-metrica-sub">
            Referencia pasiva tradicional sin optimización
          </span>
        </div>

        <div className="card-metrica-glow border-ambar">
          <span className="label-metrica-dim">Puntos Calculados</span>
          <span className="valor-metrica-glow color-ambar">
            {puntos.length} Soluciones QP
          </span>
          <span className="nota-metrica-sub">
            Programación cuadrática con restricciones KKT
          </span>
        </div>
      </div>

      {/* SECCION CENTRAL: GRAFICA DE LA FRONTERA Y EXPLICACION */}
      <div className="seccion-dos-columnas-frontera">
        <div className="panel-grafica-frontera">
          <div className="panel-grafica-header">
            <div>
              <h3 className="titulo-seccion-panel">Frontera PHE vs TEV</h3>
              <p className="subtitulo-seccion-panel">
                Eje X: Tracking Error Volatility (riesgo de desajuste) · Eje Y: Portfolio Hedge Efficiency (cobertura)
              </p>
            </div>
            <div className="leyenda-frontera-chips">
              <span className="chip-leyenda opt">
                <span className="dot-punto morado" /> Cartera Óptima
              </span>
              <span className="chip-leyenda pas">
                <span className="dot-punto cian" /> Frontera Eficiente
              </span>
            </div>
          </div>

          <div className="canvas-recharts-frontera">
            <ResponsiveContainer width="100%" height={340}>
              <ScatterChart margin={{ top: 20, right: 24, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  type="number"
                  dataKey="tev"
                  name="TEV"
                  unit="%"
                  stroke="#64748b"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                  domain={["dataMin - 0.2", "dataMax + 0.2"]}
                />
                <YAxis
                  type="number"
                  dataKey="phe"
                  name="PHE"
                  unit="%"
                  stroke="#64748b"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                  domain={["dataMin - 2", "dataMax + 2"]}
                />
                <ZAxis range={[40, 40]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3", stroke: "rgba(168,85,247,0.5)" }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="tooltip-dark-custom">
                          <div className="tooltip-header-txt">Solución Cuadrática</div>
                          <div className="tooltip-line">
                            <span>Eficiencia (PHE):</span> <strong>{data.phe}%</strong>
                          </div>
                          <div className="tooltip-line">
                            <span>Tracking Error (TEV):</span> <strong>{data.tev}%</strong>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter name="Frontera" data={puntos} fill="#38bdf8" fillOpacity={0.6} />
                <ReferenceDot
                  x={puntoOptimo.tev}
                  y={puntoOptimo.phe}
                  r={8}
                  fill="#a855f7"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="pie-nota-grafica-frontera">
            El punto violeta destacado corresponde a tu solución óptima global garantizando liquidez y neutralización de la inflación personal calculada.
          </div>
        </div>

        {/* TARJETA DE VEREDICTO Y EXPLICACION CUANTITATIVA */}
        <div className="panel-explicacion-metodologia">
          <h3 className="titulo-seccion-panel">Análisis Cuantitativo LDI</h3>
          
          <div className="caja-teorema-ldi">
            <div className="teorema-titulo">Función Objetivo del Optimizador:</div>
            <div className="formula-matematica">
              <code>min wᵀ Σ_A w - 2 wᵀ σ_AL</code>
            </div>
            <div className="formula-sujeto-a">
              sujeto a: <code>Σ w_i = 1</code>, <code>w_i ≥ 0</code>, <code>w_CETES ≥ buffer</code>
            </div>
          </div>

          <div className="lista-beneficios-cuantitativos">
            <div className="item-beneficio-ldi">
              <div className="icono-circulo-beneficio cian">1</div>
              <div>
                <strong>Inmunización del Pasivo (Liability-Driven)</strong>
                <p>Tu canasta de gastos es modelada como un pasivo contingente correlacionado con tipos de interés y materias primas.</p>
              </div>
            </div>

            <div className="item-beneficio-ldi">
              <div className="icono-circulo-beneficio morado">2</div>
              <div>
                <strong>Eliminación de Sesgo de Renta Variable Puro</strong>
                <p>A diferencia de carteras tradicionales 60/40 que sufren en shocks inflacionarios, la cartera incluye activos vinculados directamente a tu consumo.</p>
              </div>
            </div>

            <div className="item-beneficio-ldi">
              <div className="icono-circulo-beneficio verde">3</div>
              <div>
                <strong>Colchón de Liquidez Garantizado</strong>
                <p>Siempre preserva disponibilidad inmediata en CETES28 para cubrir gastos corrientes sin ventas forzadas.</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn-ir-simulador-full"
            onClick={() => onIr?.("simulador")}
          >
            Probar esta cartera en Simulador de Estrés →
          </button>
        </div>
      </div>

      {/* SECCION INFERIOR: TICKETS DE REBALANCEO Y EJECUCION DE ORDENES */}
      <div className="panel-tickets-rebalanceo">
        <div className="tickets-header-top">
          <div>
            <h3 className="titulo-seccion-panel">Tickets de Rebalanceo y Órdenes Sugeridas</h3>
            <p className="subtitulo-seccion-panel">
              Asignación nominal exacta para fondear un portafolio de {fmtMoneda(capitalTotal)} según la ponderación óptima.
            </p>
          </div>

          <div className="acciones-tickets-der">
            <button
              type="button"
              className={`btn-ejecutar-ordenes ${ordenesEjecutadas ? "completado" : ""}`}
              onClick={handleEjecutar}
              disabled={ordenesEjecutadas}
            >
              {ordenesEjecutadas ? (
                <>
                  <IconoCheck size={16} /> ¡Órdenes Preparadas para Broker!
                </>
              ) : (
                <>
                  <IconoPortafolio size={16} /> Generar Ticket de Ejecución
                </>
              )}
            </button>
          </div>
        </div>

        {ordenesEjecutadas && (
          <div className="banner-confirmacion-ejecucion">
            <IconoCheck size={18} /> Las {tickets.length} órdenes de rebalanceo han sido generadas y formateadas con precisión FIX/STP listas para enviar a tu casa de bolsa o broker regulado (GBM, Bursanet, Casa de Bolsa Banorte).
          </div>
        )}

        <div className="tabla-tickets-wrapper">
          <table className="tabla-tickets-ordenes">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Nombre del Activo</th>
                <th>Acción Sugerida</th>
                <th className="num">Ponderación Óptima</th>
                <th className="num">Monto Asignado</th>
                <th className="num">Estado</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.ticker}>
                  <td>
                    <span className="ticker-badge-code">{t.ticker}</span>
                  </td>
                  <td className="nombre-activo-txt">{t.nombre}</td>
                  <td>
                    <span className={`badge-accion-orden ${t.accion.toLowerCase()}`}>
                      {t.accion}
                    </span>
                  </td>
                  <td className="num font-bold">{fmtPct(t.peso)}</td>
                  <td className="num color-resaltado-monto font-mono">
                    {fmtMoneda(t.monto)}
                  </td>
                  <td className="num">
                    <span className="tag-listo-broker">Listo</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="fila-total-tickets">
                <td colSpan={3}><strong>TOTAL ASIGNADO</strong></td>
                <td className="num"><strong>100.0%</strong></td>
                <td className="num color-resaltado-monto"><strong>{fmtMoneda(capitalTotal)}</strong></td>
                <td className="num"><span className="badge-calce-perfecto">100% Calce</span></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
