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
import { useLanguage } from "../i18n/LanguageContext.jsx";

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
  const { t, esIngles } = useLanguage();
  const p = riesgo.percentiles;
  const serie = p.p50.map((valor, i) => ({
    mes: `M${i + 1}`,
    base90: p.p5[i],
    banda90: p.p95[i] - p.p5[i],
    base50: p.p25[i],
    banda50: p.p75[i] - p.p25[i],
    mediana: valor,
  }));

  const escenario = riesgo.media_final - 1;

  return (
    <div className="vista">
      <div className="vista-encabezado">
        <h2>{t("riesgo.title")}</h2>
        {ocupado ? <span className="chip-recalculando">{t("riesgo.recalculating")}</span> : null}
        <StaleBadge stale={riesgo.stale} asOf={riesgo.as_of} />
      </div>

      {error ? (
        <div className="panel-error vista-error" role="alert">
          <p>{error}</p>
          <button type="button" className="boton-secundario" onClick={onRetry}>
            {t("common.retry")}
          </button>
        </div>
      ) : null}

      <div className="rejilla-metricas tres">
        <MetricCard
          etiqueta={t("riesgo.var95")}
          valor={fmtPctConSigno(-riesgo.var_95)}
          nota={t("riesgo.var95Note")}
          tono="alerta"
        />
        <MetricCard
          etiqueta={t("riesgo.cvar95")}
          valor={fmtPctConSigno(-riesgo.cvar_95)}
          nota={t("riesgo.cvar95Note")}
          tono="alerta"
          destacada
        />
        <MetricCard
          etiqueta={t("riesgo.medianScenario")}
          valor={fmtPctConSigno(escenario)}
          nota={t("riesgo.medianScenarioNote")}
          tono={escenario > 0 ? "positivo" : escenario < 0 ? "alerta" : "neutro"}
        />
      </div>

      <section className="panel" aria-label={t("riesgo.horizon")}>
        <div className="selector-horizonte" role="group" aria-label={t("riesgo.horizon")}>
          <span className="slider-etiqueta">{t("riesgo.horizon")}</span>
          {HORIZONTES.map((h) => (
            <button
              key={h}
              type="button"
              className={`boton-opcion${h === horizonte ? " activo" : ""}`}
              aria-pressed={h === horizonte}
              disabled={ocupado}
              onClick={() => onHorizonte(h)}
            >
              {h} {t("riesgo.months")}
            </button>
          ))}
        </div>
      </section>

      <section
        className="panel-grafica"
        aria-label={t("riesgo.trajectoryTitle", { horizon: horizonte })}
        role="img"
      >
        <h3>{esIngles ? "Portfolio / Basket purchasing power ratio across horizon" : "Razón cartera / canasta a lo largo del horizonte"}</h3>
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
                dataKey="base90"
                stackId="banda90"
                stroke="none"
                fill="transparent"
                legendType="none"
                isAnimationActive={false}
              />
              <Area
                dataKey="banda90"
                stackId="banda90"
                stroke="none"
                fill="var(--acento-banda-suave)"
                isAnimationActive={false}
              />
              <Area
                dataKey="base50"
                stackId="banda50"
                stroke="none"
                fill="transparent"
                legendType="none"
                isAnimationActive={false}
              />
              <Area
                dataKey="banda50"
                stackId="banda50"
                stroke="none"
                fill="var(--acento-banda-fuerte)"
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
                  value: esIngles ? "preserves purchasing power" : "conservas tu poder adquisitivo",
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
            <i className="muestra banda-suave" aria-hidden="true" /> {t("riesgo.band90")}
          </span>
          <span>
            <i className="muestra banda-fuerte" aria-hidden="true" /> {t("riesgo.band50")}
          </span>
          <span>
            <i className="muestra linea" aria-hidden="true" /> {t("riesgo.median")}
          </span>
        </div>
      </section>

      <p className="pie-metodo">
        {esIngles
          ? "1,000 Merton jump-diffusion simulated trajectories. Axis represents portfolio-to-basket purchasing power ratio: 1.00 reflects full preservation of purchasing power."
          : "1000 trayectorias con proceso de saltos de Merton. El eje muestra la razón entre tu cartera y tu canasta: 1.00 significa que conservas exactamente tu poder adquisitivo."}
      </p>
    </div>
  );
}
