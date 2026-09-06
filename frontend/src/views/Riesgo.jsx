import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import MetricCard from "../components/MetricCard.jsx";
import StaleBadge from "../components/StaleBadge.jsx";
import { fmtPctConSigno, fmtRatio } from "../formato.js";

const HORIZONTES = [12, 24, 36];

function TooltipFan({ activo, etiqueta, payload }) {
  if (!activo || !payload?.length) return null;
  const mediana = payload.find((p) => p.dataKey === "mediana");
  return (
    <div className="tooltip-fan">
      <span className="tooltip-mes">{etiqueta}</span>
      <span className="num">{fmtRatio(mediana?.value)}</span>
    </div>
  );
}

export default function Riesgo({ riesgo, horizonte, onHorizonte, ocupado, error, onRetry }) {
  const p = riesgo.percentiles;
  const serie = p.p50.map((valor, i) => ({
    mes: `M${i + 1}`,
    base: p.p5[i],
    banda_baja: p.p25[i] - p.p5[i],
    banda_alta: p.p95[i] - p.p25[i],
    mediana: valor,
  }));

  const escenario = riesgo.media_final - 1;

  return (
    <div className="vista">
      <div className="vista-encabezado">
        <h2>Riesgo</h2>
        {ocupado ? <span className="chip-recalculando">Recalculando…</span> : null}
        <StaleBadge stale={riesgo.stale} asOf={riesgo.as_of} />
      </div>

      {error ? (
        <div className="panel-error vista-error" role="alert">
          <p>{error}</p>
          <button type="button" className="boton-secundario" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      ) : null}

      <div className="rejilla-metricas tres">
        <MetricCard
          etiqueta="VaR 95%"
          valor={fmtPctConSigno(-riesgo.var_95)}
          nota="Pérdida de poder adquisitivo en el peor 5% de escenarios"
          tono="alerta"
        />
        <MetricCard
          etiqueta="CVaR 95%"
          valor={fmtPctConSigno(-riesgo.cvar_95)}
          nota="Pérdida promedio dentro de ese peor 5%"
          tono="alerta"
          destacada
        />
        <MetricCard
          etiqueta="Escenario medio"
          valor={fmtPctConSigno(escenario)}
          nota="Poder adquisitivo ganado o perdido al cierre"
          tono={escenario > 0 ? "positivo" : escenario < 0 ? "alerta" : "neutro"}
        />
      </div>

      <section className="panel" aria-label="Horizonte de simulación">
        <div className="selector-horizonte" role="group" aria-label="Horizonte en meses">
          <span className="slider-etiqueta">Horizonte</span>
          {HORIZONTES.map((h) => (
            <button
              key={h}
              type="button"
              className={`boton-opcion${h === horizonte ? " activo" : ""}`}
              aria-pressed={h === horizonte}
              disabled={ocupado}
              onClick={() => onHorizonte(h)}
            >
              {h} meses
            </button>
          ))}
        </div>
      </section>

      <section
        className="panel-grafica"
        aria-label={`Trayectoria de poder adquisitivo a ${horizonte} meses`}
        role="img"
      >
        <h3>Razón cartera / canasta a lo largo del horizonte</h3>
        <div className="alto-grafica">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={serie} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="var(--tinta-suave)" minTickGap={24} />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 12 }}
                stroke="var(--tinta-suave)"
                tickFormatter={fmtRatio}
                width={52}
              />
              <Tooltip content={<TooltipFan />} />
              <Area
                dataKey="base"
                stackId="banda"
                stroke="none"
                fill="transparent"
                legendType="none"
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
              <ReferenceLine
                y={1}
                stroke="var(--tinta-suave)"
                strokeDasharray="4 4"
                label={{
                  value: "conservas tu poder adquisitivo",
                  position: "insideTopRight",
                  fontSize: 11,
                  fill: "var(--tinta-suave)",
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="leyenda-fan">
          <span>
            <i className="muestra banda-suave" aria-hidden="true" /> Banda p25–p95
          </span>
          <span>
            <i className="muestra banda-fuerte" aria-hidden="true" /> Banda p5–p25
          </span>
          <span>
            <i className="muestra linea" aria-hidden="true" /> Mediana
          </span>
        </div>
      </section>

      <p className="pie-metodo">
        1000 trayectorias con proceso de saltos de Merton. El eje muestra la razón entre tu
        cartera y tu canasta: 1.00 significa que conservas exactamente tu poder adquisitivo.
      </p>
    </div>
  );
}
