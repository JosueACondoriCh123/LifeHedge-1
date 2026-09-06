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

const COLORES = [
  "#0f5132",
  "#3f7d5c",
  "#5a6b7f",
  "#8494a7",
  "#b0885a",
  "#a4553f",
  "#6b705c",
  "#345e7d",
];

export default function Cobertura({ optimo, onBuffer, ocupado, error, onRetry }) {
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
        <h2>Cobertura</h2>
        {ocupado ? <span className="chip-recalculando">Recalculando…</span> : null}
        <StaleBadge stale={optimo.stale} asOf={optimo.as_of} />
      </div>

      {error ? (
        <div className="panel-error vista-error" role="alert">
          <p>{error}</p>
          <button type="button" className="boton-secundario" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      ) : null}

      <section className="comparacion" aria-label="Comparación de cobertura contra solo Cetes">
        <div className="comparacion-lado vida">
          <span className="comparacion-marca">LifeHedge</span>
          <span className="comparacion-cifra num">{fmtPctDetallado(optimo.phe)}</span>
          <span className="comparacion-pie">de la varianza de tu inflación neutralizada</span>
        </div>
        <div className="comparacion-contra">
          <span>vs.</span>
        </div>
        <div className="comparacion-lado cetes">
          <span className="comparacion-marca">Solo Cetes</span>
          <span className="comparacion-cifra num">
            {fmtPctDetallado(optimo.benchmark_cetes.phe)}
          </span>
          <span className="comparacion-pie">cobertura de la referencia obvia</span>
        </div>
      </section>
      <p className="comparacion-veredicto">
        LifeHedge cubre <strong>{fmtPuntos(puntosExtra)}</strong> más que dejar todo en Cetes.
      </p>

      <div className="rejilla-metricas dos">
        <MetricCard
          etiqueta="Tracking error"
          valor={fmtPct(optimo.tev)}
          nota="Desajuste anualizado contra tu canasta"
        />
        <MetricCard
          etiqueta="Colchón en Cetes"
          valor={fmtPct(bufferPct / 100)}
          nota="Fracción mínima de la cartera en efectivo"
        />
      </div>

      <section className="panel" aria-label="Colchón de efectivo">
        <label className="slider-fila">
          <span className="slider-etiqueta">Buffer de efectivo en Cetes</span>
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
            aria-valuetext={`${bufferPct} por ciento`}
          />
          <span className="num slider-valor">{bufferPct}%</span>
        </label>
      </section>

      <section className="panel-grafica" aria-label="Pesos de la cartera óptima">
        <h3>Cartera óptima por activo</h3>
        <div className="alto-grafica">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barras} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="var(--linea)" vertical={false} />
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
              <Tooltip formatter={(v) => [`${v.toFixed(2)}%`, "Peso"]} />
              <Bar dataKey="peso" radius={[3, 3, 0, 0]}>
                {barras.map((entrada, i) => (
                  <Cell key={entrada.ticker} fill={COLORES[i % COLORES.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="columnas">
        <section className="panel" aria-label="Tabla de la cartera">
          <h3>Composición</h3>
          <div className="tabla-desplazable">
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
          </div>
        </section>

        <section className="panel-grafica" aria-label="Frontera de cobertura">
          <h3>Frontera de cobertura</h3>
          <div className="alto-grafica">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="var(--linea)" />
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
                <Scatter data={puntos} fill="var(--azul-apagado)" fillOpacity={0.55} />
                <ReferenceDot x={elegido.tev} y={elegido.phe} r={6} fill="var(--acento)" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="panel-nota">El punto verde es la cartera elegida.</p>
        </section>
      </div>
    </div>
  );
}
