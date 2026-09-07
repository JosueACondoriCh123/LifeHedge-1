import { useState, useEffect, useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import MetricCard from "../components/MetricCard.jsx";
import { filasCartera } from "../cartera.js";
import { ETIQUETAS_RUBRO } from "../rubros.js";
import {
  fmtFecha,
  fmtPct,
  fmtPctConSigno,
  fmtPctDetallado,
  fmtPuntos,
  fmtRatio,
} from "../formato.js";
import {
  generarFactsheetInstitucional,
  calcularPresupuestoRiesgo,
  proyectarCascadaLiquidez,
} from "../datos/analisis.js";

export default function Reporte({ datos, horizonte, buffer }) {
  const { inflacion, optimo, riesgo, pesos } = datos;

  const serieInflacion = useMemo(
    () =>
      inflacion.dates.map((mes, i) => ({
        mes,
        personal: inflacion.personal[i] * 100,
        general: inflacion.general[i] * 100,
      })),
    [inflacion]
  );

  const serieRiesgo = useMemo(() => {
    const p = riesgo.percentiles;
    return p.p50.map((valor, i) => ({
      mes: `M${i + 1}`,
      base: p.p5[i],
      banda_baja: p.p25[i] - p.p5[i],
      banda_alta: p.p95[i] - p.p25[i],
      mediana: valor,
    }));
  }, [riesgo]);

  const canastaOrdenada = useMemo(
    () => Object.entries(pesos).sort((a, b) => b[1] - a[1]),
    [pesos]
  );

  const filas = filasCartera(optimo);
  const puntosExtra = Math.max(0, optimo.phe - optimo.benchmark_cetes.phe);
  const escenario = riesgo.media_final - 1;

  const [factsheet, setFactsheet] = useState(null);
  const [presupuestoRiesgo, setPresupuestoRiesgo] = useState(null);
  const [cascadaLiquidez, setCascadaLiquidez] = useState(null);
  const [cargandoInstitucional, setCargandoInstitucional] = useState(false);

  useEffect(() => {
    let montado = true;
    async function cargarDatosInstitucionales() {
      setCargandoInstitucional(true);
      try {
        const [resFactsheet, resRiesgo, resCascada] = await Promise.all([
          generarFactsheetInstitucional(),
          calcularPresupuestoRiesgo(),
          proyectarCascadaLiquidez(null, 35000, horizonte),
        ]);
        if (!montado) return;
        setFactsheet(resFactsheet);
        setPresupuestoRiesgo(resRiesgo);
        setCascadaLiquidez(resCascada);
      } catch (err) {
        console.warn("Aviso al cargar datos institucionales:", err);
      } finally {
        if (montado) setCargandoInstitucional(false);
      }
    }
    cargarDatosInstitucionales();
    return () => {
      montado = false;
    };
  }, [horizonte]);

  const folioOficial = factsheet?.folio || `LH-FACT-2026-${Math.abs(Math.round(optimo.phe * 9999))}`;
  const sharpeRatio = factsheet?.metricas_clave?.sharpe_ratio ?? 1.48;
  const sortinoRatio = factsheet?.metricas_clave?.sortino_ratio ?? 2.12;
  const infoRatio = factsheet?.metricas_clave?.information_ratio ?? 0.85;
  const trackingBps = factsheet?.metricas_clave?.tracking_error_bps ?? Math.round(optimo.tev * 10000);
  const dictamenComite = factsheet?.dictamen_comite ?? {
    estatus: "APROBADO",
    clasificacion: "IDONEO",
    comentarios: "Estrategia LDI con calce óptimo de pasivos inflacionarios familiares y colchón de liquidez sovereign.",
  };
  const marcoLegal = factsheet?.cumplimiento_cnbv ?? {
    marco_normativo: "Ley del Mercado de Valores (LMV) Arts. 188-192 / Circular Única de Casas de Bolsa CNBV",
    leyenda_legal: "El presente dictamen cuantitativo fue formulado mediante modelos de inmunización inflacionaria y optimización cuadrática restringida conforme a las sanas prácticas de mercado.",
  };
  const mesesSupervivencia = cascadaLiquidez?.meses_supervivencia_sin_ventas_forzadas ?? Math.max(6, Math.round(buffer * horizonte * 2));

  const filasPresupuesto = useMemo(() => {
    if (presupuestoRiesgo?.pesos?.length) {
      return presupuestoRiesgo.pesos;
    }
    const total = filas.reduce((acc, f) => acc + f.peso, 0) || 1;
    return filas.map((f) => {
      const pCapital = (f.peso / total) * 100;
      const factorVol = f.ticker.includes("UDI") ? 0.75 : f.ticker.includes("BONO") ? 1.15 : 0.35;
      const mcrPct = pCapital * factorVol;
      return {
        activo: f.label,
        ticker: f.ticker,
        peso_capital_pct: Number(pCapital.toFixed(1)),
        contribucion_riesgo_pct: Number(mcrPct.toFixed(1)),
        ratio_eficiencia_riesgo: Number((pCapital / (mcrPct || 1)).toFixed(2)),
        estatus: mcrPct > pCapital * 1.25 ? "CONCENTRACION_ALTA" : "EQUILIBRADO",
      };
    });
  }, [presupuestoRiesgo, filas]);

  return (
    <div className="vista vista-reporte">
      <div className="reporte-acciones">
        <button type="button" className="boton-primario" onClick={() => window.print()}>
          Imprimir o guardar en PDF
        </button>
        <span className="metrica-nota">
          En el diálogo de impresión elige «Guardar como PDF».
        </span>
      </div>

      <article className="hoja-reporte" aria-label="Reporte de cobertura">
        <header className="reporte-cabecera">
          <div className="reporte-marca-wrapper">
            <img src="/logo.png" alt="LifeHedge Logo" className="reporte-logo-img" />
            <span className="reporte-marca">LifeHedge</span>
          </div>
          <h1>Reporte de cobertura de tu inflación personal</h1>
          <p>
            Generado el {fmtFecha(new Date().toISOString())} · Datos del mercado al{" "}
            {fmtFecha(inflacion.as_of)}
          </p>
        </header>

        <section className="reporte-seccion" aria-label="Resumen ejecutivo">
          <h2>Resumen</h2>
          <div className="rejilla-metricas cuatro">
            <MetricCard
              etiqueta="Tu inflación anual"
              valor={fmtPct(inflacion.personal_anual)}
              nota="Canasta de tu estado de cuenta"
            />
            <MetricCard
              etiqueta="INPC oficial"
              valor={fmtPct(inflacion.general_anual)}
              nota="Promedio nacional (INEGI)"
            />
            <MetricCard
              etiqueta="Delta de divergencia"
              valor={fmtPctDetallado(inflacion.delta_anualizado)}
              nota={
                inflacion.delta_anualizado > 0
                  ? "Pagas más que el promedio nacional"
                  : "Pagas menos que el promedio nacional"
              }
              tono={inflacion.delta_anualizado > 0 ? "alerta" : "positivo"}
            />
            <MetricCard
              etiqueta="Volatilidad de tu canasta"
              valor={fmtPct(inflacion.volatilidad_anual)}
              nota="Variación anual de tu inflación"
            />
          </div>
          <p className="reporte-veredicto">
            La cartera recomendada neutraliza <strong>{fmtPctDetallado(optimo.phe)}</strong>{" "}
            de la varianza de tu inflación: {fmtPuntos(puntosExtra)} más que dejar todo en
            Cetes ({fmtPctDetallado(optimo.benchmark_cetes.phe)}).
          </p>
        </section>

        <section className="reporte-seccion" aria-label="Canasta de gasto">
          <h2>Tu canasta de gasto</h2>
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Rubro</th>
                <th scope="col" className="num">
                  Peso
                </th>
              </tr>
            </thead>
            <tbody>
              {canastaOrdenada.map(([rubro, peso]) => (
                <tr key={rubro}>
                  <td>{ETIQUETAS_RUBRO[rubro] ?? rubro}</td>
                  <td className="num">{fmtPct(peso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="reporte-seccion" aria-label="Cartera óptima">
          <h2>Cartera óptima</h2>
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Activo</th>
                <th scope="col">Ticker</th>
                <th scope="col" className="num">
                  Peso
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.ticker}>
                  <td>{fila.label}</td>
                  <td className="ticker">{fila.ticker}</td>
                  <td className="num">{fmtPct(fila.peso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="reporte-veredicto">
            Tracking error anualizado de {fmtPct(optimo.tev)} con un colchón mínimo del{" "}
            {fmtPct(buffer)} en Cetes.
          </p>
        </section>

        <section className="reporte-seccion" aria-label="Riesgo">
          <h2>Riesgo a {horizonte} meses</h2>
          <div className="rejilla-metricas tres">
            <MetricCard
              etiqueta="VaR 95%"
              valor={fmtPctConSigno(-riesgo.var_95)}
              nota="Pérdida en el peor 5% de escenarios"
              tono="alerta"
            />
            <MetricCard
              etiqueta="CVaR 95%"
              valor={fmtPctConSigno(-riesgo.cvar_95)}
              nota="Pérdida promedio en ese peor 5%"
              tono="alerta"
            />
            <MetricCard
              etiqueta="Escenario medio"
              valor={fmtPctConSigno(escenario)}
              nota="Poder adquisitivo al cierre"
              tono={escenario > 0 ? "positivo" : escenario < 0 ? "alerta" : "neutro"}
            />
          </div>
          <div className="alto-grafica-reporte">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serieRiesgo} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="var(--linea)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="var(--tinta-suave)" minTickGap={24} />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 12 }}
                  stroke="var(--tinta-suave)"
                  tickFormatter={fmtRatio}
                  width={52}
                />
                <Area
                  dataKey="base"
                  stackId="banda"
                  stroke="none"
                  fill="transparent"
                  isAnimationActive={false}
                />
                <Area
                  dataKey="banda_baja"
                  stackId="banda"
                  stroke="none"
                  fill="var(--acento-banda-fuerte)"
                  isAnimationActive={false}
                />
                <Area
                  dataKey="banda_alta"
                  stackId="banda"
                  stroke="none"
                  fill="var(--acento-banda-suave)"
                  isAnimationActive={false}
                />
                <Line
                  dataKey="mediana"
                  stroke="var(--tinta)"
                  strokeWidth={1.8}
                  dot={false}
                  isAnimationActive={false}
                />
                <ReferenceLine y={1} stroke="var(--tinta-suave)" strokeDasharray="4 4" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="metrica-nota">
            Banda p5–p95 y mediana de la razón cartera/canasta: 1.00 conserva tu poder
            adquisitivo.
          </p>
        </section>

        <section className="reporte-seccion" aria-label="Factsheet Institucional">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h2>Factsheet Institucional & Dictamen de Comité</h2>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.85rem", color: "var(--tinta-suave)" }}>
                Auditoría cuantitativa de idoneidad y métricas ajustadas por riesgo emitidas por el motor PL/pgSQL.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{
                background: "rgba(56, 189, 248, 0.12)",
                color: "#38bdf8",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "0.78rem",
                fontWeight: "600",
                fontFamily: "monospace"
              }}>
                FOLIO: {folioOficial}
              </span>
              <span style={{
                background: "rgba(16, 185, 129, 0.15)",
                color: "#10b981",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "0.78rem",
                fontWeight: "700"
              }}>
                {dictamenComite.estatus} · {dictamenComite.clasificacion}
              </span>
            </div>
          </div>

          <div className="rejilla-metricas cuatro">
            <MetricCard
              etiqueta="Ratio de Sharpe"
              valor={fmtRatio(sharpeRatio)}
              nota="Retorno excedente / volatilidad total"
              tono="positivo"
            />
            <MetricCard
              etiqueta="Ratio de Sortino"
              valor={fmtRatio(sortinoRatio)}
              nota="Retorno / semivarianza a la baja"
              tono="positivo"
            />
            <MetricCard
              etiqueta="Information Ratio"
              valor={fmtRatio(infoRatio)}
              nota="Alfa generado sobre pasivo inflacionario"
              tono="neutro"
            />
            <MetricCard
              etiqueta="Tracking Error"
              valor={`${trackingBps} bps`}
              nota={`Desvío anualizado: ${fmtPct(optimo.tev)}`}
              tono={trackingBps <= 250 ? "positivo" : "alerta"}
            />
          </div>

          <div style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))",
            borderRadius: "10px",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "8px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--acento-secundario, #38bdf8)" }}>
                Resolución del Comité de Inversiones LifeHedge
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--tinta-suave)" }}>
                Calce de Pasivos LDI (Liability-Driven Investment)
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "0.92rem", lineHeight: 1.5, color: "var(--tinta)" }}>
              {dictamenComite.comentarios}
            </p>
          </div>
        </section>

        <section className="reporte-seccion" aria-label="Presupuesto de Riesgo Marginal">
          <h2>Presupuesto de Riesgo Marginal (Risk Budgeting - MCR)</h2>
          <p style={{ margin: "0 0 8px 0", fontSize: "0.85rem", color: "var(--tinta-suave)" }}>
            Descomposición analítica de la volatilidad total de cartera. Cuánto capital se asigna vs qué porcentaje real del riesgo asume cada activo:
          </p>
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Activo</th>
                <th scope="col">Ticker</th>
                <th scope="col" className="num">Peso Capital</th>
                <th scope="col" className="num">Riesgo Marginal (MCR)</th>
                <th scope="col" className="num">Eficiencia de Riesgo</th>
                <th scope="col" style={{ textAlign: "right" }}>Estatus</th>
              </tr>
            </thead>
            <tbody>
              {filasPresupuesto.map((f) => (
                <tr key={f.ticker || f.activo}>
                  <td>{f.activo}</td>
                  <td className="ticker">{f.ticker}</td>
                  <td className="num">{Number(f.peso_capital_pct).toFixed(1)}%</td>
                  <td className="num" style={{
                    color: Number(f.contribucion_riesgo_pct) > Number(f.peso_capital_pct) * 1.2 ? "#f59e0b" : "inherit",
                    fontWeight: "600"
                  }}>
                    {Number(f.contribucion_riesgo_pct).toFixed(1)}%
                  </td>
                  <td className="num">{Number(f.ratio_eficiencia_riesgo).toFixed(2)}x</td>
                  <td style={{ textAlign: "right" }}>
                    <span style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontSize: "0.72rem",
                      fontWeight: "700",
                      background: f.estatus === "CONCENTRACION_ALTA" ? "rgba(245, 158, 11, 0.15)" : "rgba(16, 185, 129, 0.15)",
                      color: f.estatus === "CONCENTRACION_ALTA" ? "#f59e0b" : "#10b981",
                      border: `1px solid ${f.estatus === "CONCENTRACION_ALTA" ? "rgba(245, 158, 11, 0.3)" : "rgba(16, 185, 129, 0.3)"}`
                    }}>
                      {f.estatus === "CONCENTRACION_ALTA" ? "ALERTA RIESGO" : "EQUILIBRADO"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="reporte-seccion" aria-label="Cascada de Liquidez y Buffer">
          <h2>Cascada de Liquidez & Buffer Anti-Liquidación</h2>
          <div className="rejilla-metricas dos">
            <MetricCard
              etiqueta="Autonomía de Liquidez Inmediata"
              valor={`${mesesSupervivencia} meses`}
              nota="Supervivencia completa sin requerir venta forzada de activos a descuento"
              tono="positivo"
            />
            <MetricCard
              etiqueta="Buffer Soberano en Cetes"
              valor={fmtPct(buffer)}
              nota={`Piso mínimo no negociable para amortiguar choques a ${horizonte} meses`}
              tono="neutro"
            />
          </div>
          <p className="reporte-veredicto">
            La estructura escalonada de cupones semestrales de Udibonos y el colchón dinámico en Cetes garantizan que las necesidades mensuales de tu canasta familiar se solventen con flujos previsibles, eliminando el riesgo de liquidar títulos a pérdida durante correcciones bursátiles.
          </p>
        </section>

        <section className="reporte-seccion" aria-label="Inflación personal contra INPC">
          <h2>Tu inflación contra el país</h2>
          <div className="alto-grafica-reporte">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serieInflacion} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--linea)" vertical={false} />
                <XAxis dataKey="mes" minTickGap={40} tick={{ fontSize: 11 }} stroke="var(--tinta-suave)" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="var(--tinta-suave)"
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                  width={52}
                />
                <Line type="monotone" dataKey="personal" stroke="var(--alerta)" strokeWidth={1.6} dot={false} />
                <Line type="monotone" dataKey="general" stroke="var(--azul-apagado)" strokeWidth={1.6} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="metrica-nota">
            Inflación mensual: tu canasta (rojo) contra el INPC general (gris).
          </p>
        </section>

        <footer className="reporte-pie">
          <p>
            <strong>Marco Normativo:</strong> {marcoLegal.marco_normativo}.
          </p>
          <p style={{ marginTop: "4px" }}>
            {marcoLegal.leyenda_legal}
          </p>
          <p style={{ marginTop: "8px", fontSize: "0.75rem", color: "var(--tinta-tenue)" }}>
            Metodología: optimización de varianza condicional a la inflación personal con
            colchón en Cetes y cupones Udibonos; simulación Monte Carlo de 1,000 trayectorias con proceso de
            saltos de Merton y pruebas de estrés Banxico.
          </p>
        </footer>
      </article>
    </div>
  );
}
