import { useMemo } from "react";
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
          <span className="reporte-marca">LifeHedge</span>
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
            Metodología: cartera que minimiza la varianza de tu inflación personal con
            colchón en Cetes; simulación Monte Carlo de 1,000 trayectorias con proceso de
            saltos de Merton.
          </p>
          <p>Este reporte es educativo y no constituye asesoría de inversión.</p>
        </footer>
      </article>
    </div>
  );
}
