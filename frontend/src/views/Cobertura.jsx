import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceDot,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import MetricCard from "../components/MetricCard.jsx";
import StaleBadge from "../components/StaleBadge.jsx";
import { filasCartera } from "../cartera.js";
import { fmtPct, fmtPctDetallado, fmtPuntos } from "../formato.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";

const COLORES = [
  "#f8cc1b",
  "#9da4aa",
  "#4ade80",
  "#d5b84b",
  "#e7d27b",
  "#d9895b",
  "#8ebc72",
  "#cf7777",
];

export default function Cobertura({ optimo, onBuffer, ocupado, error, onRetry }) {
  const { t } = useLanguage();
  const [bufferPct, setBufferPct] = useState(10);
  const enviado = useRef(10);

  useEffect(() => {
    if (bufferPct === enviado.current) return undefined;
    const temporizador = setTimeout(() => {
      enviado.current = bufferPct;
      onBuffer(bufferPct / 100);
    }, 300);
    return () => clearTimeout(temporizador);
  }, [bufferPct, onBuffer]);

  const barras = optimo.assets.map((activo, i) => ({
    etiqueta: activo.label,
    ticker: activo.ticker,
    peso: optimo.weights[i] * 100,
  }));

  const puntos = optimo.frontera.map((p) => ({
    tev: p.tev * 100,
    phe: p.phe * 100,
  }));

  const elegido = { tev: optimo.tev * 100, phe: optimo.phe * 100 };
  const puntosExtra = Math.max(0, optimo.phe - optimo.benchmark_cetes.phe);
  const filas = filasCartera(optimo);

  return (
    <div className="vista">
      <div className="vista-encabezado">
        <h2>{t("cobertura.title")}</h2>
        {ocupado ? <span className="chip-recalculando">{t("cobertura.recalculating")}</span> : null}
        <StaleBadge stale={optimo.stale} asOf={optimo.as_of} />
      </div>

      {error ? (
        <div className="panel-error vista-error" role="alert">
          <p>{error}</p>
          <button type="button" className="boton-secundario" onClick={onRetry}>
            {t("common.retry")}
          </button>
        </div>
      ) : null}

      <section className="comparacion" aria-label="Comparación de cobertura contra solo Cetes">
        <div className="comparacion-lado vida">
          <span className="comparacion-marca">LifeHedge</span>
          <span className="comparacion-cifra num">{fmtPctDetallado(optimo.phe)}</span>
          <span className="comparacion-pie">{t("cobertura.varianceNeutralized")}</span>
        </div>
        <div className="comparacion-contra">
          <span>vs.</span>
        </div>
        <div className="comparacion-lado cetes">
          <span className="comparacion-marca">Solo Cetes</span>
          <span className="comparacion-cifra num">
            {fmtPctDetallado(optimo.benchmark_cetes.phe)}
          </span>
          <span className="comparacion-pie">{t("cobertura.cetesBaseline")}</span>
        </div>
      </section>
      <p className="comparacion-veredicto">
        {t("cobertura.verdict", { pts: fmtPuntos(puntosExtra) })}
      </p>

      <div className="rejilla-metricas dos">
        <MetricCard
          etiqueta={t("cobertura.trackingError")}
          valor={fmtPct(optimo.tev)}
          nota={t("cobertura.trackingErrorNote")}
        />
        <MetricCard
          etiqueta={t("cobertura.cetesBuffer")}
          valor={fmtPct(bufferPct / 100)}
          nota={t("cobertura.cetesBufferNote")}
        />
      </div>

      <section className="panel" aria-label={t("cobertura.bufferSliderLabel")}>
        <label className="slider-fila">
          <span className="slider-etiqueta">{t("cobertura.bufferSliderLabel")}</span>
          <input
            type="range"
            min="0"
            max="50"
            step="1"
            value={bufferPct}
            disabled={ocupado}
            onChange={(e) => setBufferPct(Number(e.target.value))}
            aria-valuemin={0}
            aria-valuemax={50}
            aria-valuenow={bufferPct}
            aria-valuetext={`${bufferPct} %`}
          />
          <span className="num slider-valor">{bufferPct}%</span>
        </label>
      </section>

      <section className="panel-grafica" aria-label={t("cobertura.optimalByAsset")}>
        <h3>{t("cobertura.optimalByAsset")}</h3>
        <div className="alto-grafica">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barras} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="var(--linea)" strokeDasharray="3 5" vertical={false} />
              <XAxis
                dataKey="etiqueta"
                tick={{ fontSize: 11 }}
                stroke="var(--tinta-suave)"
                interval={0}
                angle={-18}
                textAnchor="end"
                height={54}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="var(--tinta-suave)"
                tickFormatter={(v) => `${v.toFixed(0)}%`}
                width={46}
              />
              <Tooltip formatter={(v) => [`${v.toFixed(2)}%`, t("cobertura.colWeight")]} />
              <Bar dataKey="peso" radius={[5, 5, 0, 0]} maxBarSize={54}>
                {barras.map((entrada, i) => (
                  <Cell key={entrada.ticker} fill={COLORES[i % COLORES.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="columnas">
        <section className="panel" aria-label={t("cobertura.composition")}>
          <h3>{t("cobertura.composition")}</h3>
          <div className="tabla-desplazable">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">{t("cobertura.colAsset")}</th>
                  <th scope="col">{t("cobertura.colTicker")}</th>
                  <th scope="col" className="num">
                    {t("cobertura.colWeight")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.ticker}>
                    <td>{t("tickers." + fila.ticker, {}, fila.label)}</td>
                    <td className="ticker">{fila.ticker}</td>
                    <td className="num">{fmtPct(fila.peso)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel-grafica" aria-label={t("cobertura.frontierTitle")}>
          <h3>{t("cobertura.frontierTitle")}</h3>
          <div className="alto-grafica">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="var(--linea)" strokeDasharray="3 5" />
                <XAxis
                  type="number"
                  dataKey="tev"
                  name="TEV"
                  tick={{ fontSize: 12 }}
                  stroke="var(--tinta-suave)"
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                />
                <YAxis
                  type="number"
                  dataKey="phe"
                  name="PHE"
                  tick={{ fontSize: 12 }}
                  stroke="var(--tinta-suave)"
                  tickFormatter={(v) => `${v.toFixed(0)}%`}
                  width={46}
                />
                <ZAxis range={[36, 36]} />
                <Tooltip formatter={(v) => `${v.toFixed(2)}%`} />
                <Scatter data={puntos} fill="var(--azul-apagado)" fillOpacity={0.68} />
                <ReferenceDot x={elegido.tev} y={elegido.phe} r={7} fill="var(--verde-esmeralda)" stroke="#dffff6" strokeWidth={2} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="panel-nota">{t("cobertura.frontierNote")}</p>
        </section>
      </div>
    </div>
  );
}
