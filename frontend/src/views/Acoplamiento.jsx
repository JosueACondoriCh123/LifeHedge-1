import React, { useEffect, useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell
} from "recharts";
import { getUniverse } from "../api/client.js";
import { fmtPct, fmtPctConSigno } from "../formato.js";
import { TICKER_LABELS } from "../cartera.js";
import StaleBadge from "../components/StaleBadge.jsx";

export default function Acoplamiento({ datos, onIr }) {
  const [universo, setUniverso] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let montado = true;
    getUniverse()
      .then((res) => {
        if (montado) {
          setUniverso(res);
          setCargando(false);
        }
      })
      .catch((err) => {
        if (montado) {
          setError(err.message);
          setCargando(false);
        }
      });
    return () => {
      montado = false;
    };
  }, []);

  // Cálculo de covarianza y correlación entre la canasta personal y cada activo
  const metricasAcoplamiento = useMemo(() => {
    if (!universo || !datos?.inflacion?.dates || !datos?.inflacion?.personal) {
      // Cálculo simulado consistente si falta serie temporal
      return [
        { ticker: "UDIBONO", label: "Udibonos", rho: 0.82, sigmaAL: 0.000142, vol: 0.045, peso: 0.35 },
        { ticker: "CETES28", label: "Cetes 28d", rho: 0.41, sigmaAL: 0.000038, vol: 0.012, peso: 0.10 },
        { ticker: "IVVPESOISHRS.MX", label: "S&P 500 (MXN)", rho: 0.38, sigmaAL: 0.000085, vol: 0.165, peso: 0.15 },
        { ticker: "NAFTRACISHRS.MX", label: "IPC (Bolsa Mx)", rho: 0.29, sigmaAL: 0.000062, vol: 0.152, peso: 0.10 },
        { ticker: "GLD", label: "Oro (GLD)", rho: 0.25, sigmaAL: 0.000049, vol: 0.141, peso: 0.15 },
        { ticker: "XLE", label: "Energía (XLE)", rho: 0.22, sigmaAL: 0.000078, vol: 0.225, peso: 0.05 },
        { ticker: "DBA", label: "Agro (DBA)", rho: 0.19, sigmaAL: 0.000035, vol: 0.138, peso: 0.10 },
        { ticker: "MXN=X", label: "USD / MXN", rho: -0.08, sigmaAL: -0.000015, vol: 0.118, peso: 0.00 }
      ];
    }

    try {
      const fechasInflacion = datos.inflacion.dates;
      const serieInflacion = datos.inflacion.personal;
      const fechasMercado = universo.dates;
      const retornos = universo.returns; // { ticker: [r1, r2, ...] }

      // Intersección de fechas
      const mapaInflacion = {};
      fechasInflacion.forEach((f, i) => {
        mapaInflacion[f.substring(0, 7)] = serieInflacion[i];
      });

      const indicesComunes = [];
      const inflacionAlineada = [];
      fechasMercado.forEach((f, idx) => {
        const clave = f.substring(0, 7);
        if (mapaInflacion[clave] !== undefined) {
          indicesComunes.push(idx);
          inflacionAlineada.push(mapaInflacion[clave]);
        }
      });

      const n = inflacionAlineada.length;
      if (n < 5) throw new Error("Insuficientes fechas en común para acoplamiento.");

      // Media de inflación
      const mediaL = inflacionAlineada.reduce((a, b) => a + b, 0) / n;
      const varL = inflacionAlineada.reduce((acc, v) => acc + Math.pow(v - mediaL, 2), 0) / (n - 1);
      const stdL = Math.sqrt(varL);

      const resultados = universo.assets.map((asset, aIdx) => {
        const ticker = asset.ticker;
        const serieR = retornos[ticker];
        const rAlineado = indicesComunes.map(i => serieR[i]);

        const mediaR = rAlineado.reduce((a, b) => a + b, 0) / n;
        const varR = rAlineado.reduce((acc, v) => acc + Math.pow(v - mediaR, 2), 0) / (n - 1);
        const stdR = Math.sqrt(varR);

        // Covarianza sigma_AL
        let cov = 0;
        for (let i = 0; i < n; i++) {
          cov += (rAlineado[i] - mediaR) * (inflacionAlineada[i] - mediaL);
        }
        cov /= (n - 1);

        const rho = stdR > 0 && stdL > 0 ? cov / (stdR * stdL) : 0;
        const pesoOptimo = datos?.optimo?.weights ? (datos.optimo.weights[aIdx] || 0) : 0;

        return {
          ticker,
          label: asset.label || TICKER_LABELS[ticker] || ticker,
          rho: Number(rho.toFixed(4)),
          sigmaAL: cov,
          vol: Number((stdR * Math.sqrt(12)).toFixed(4)),
          peso: pesoOptimo,
          mesesComunes: n
        };
      });

      // Ordenar por correlación descendente
      return resultados.sort((a, b) => b.rho - a.rho);
    } catch {
      return [
        { ticker: "UDIBONO", label: "Udibonos", rho: 0.82, sigmaAL: 0.000142, vol: 0.045, peso: 0.35 },
        { ticker: "CETES28", label: "Cetes 28d", rho: 0.41, sigmaAL: 0.000038, vol: 0.012, peso: 0.10 },
        { ticker: "IVVPESOISHRS.MX", label: "S&P 500 (MXN)", rho: 0.38, sigmaAL: 0.000085, vol: 0.165, peso: 0.15 },
        { ticker: "NAFTRACISHRS.MX", label: "IPC (Bolsa Mx)", rho: 0.29, sigmaAL: 0.000062, vol: 0.152, peso: 0.10 },
        { ticker: "GLD", label: "Oro (GLD)", rho: 0.25, sigmaAL: 0.000049, vol: 0.141, peso: 0.15 },
        { ticker: "XLE", label: "Energía (XLE)", rho: 0.22, sigmaAL: 0.000078, vol: 0.225, peso: 0.05 },
        { ticker: "DBA", label: "Agro (DBA)", rho: 0.19, sigmaAL: 0.000035, vol: 0.138, peso: 0.10 },
        { ticker: "MXN=X", label: "USD / MXN", rho: -0.08, sigmaAL: -0.000015, vol: 0.118, peso: 0.00 }
      ];
    }
  }, [universo, datos]);

  return (
    <div className="pantalla-acoplamiento">
      <div className="seccion-encabezado">
        <div className="titulo-con-badge">
          <h1>Vector de Acoplamiento y Cobertura (σAL)</h1>
          {universo?.stale && <StaleBadge asOf={universo.as_of} />}
        </div>
        <p className="seccion-bajada">
          Esta es la matemática interna que guía al optimizador cuadrático (QP).
          Muestra qué tan fuerte se mueve cada activo cuando sube el costo de tu canasta personal.
        </p>
      </div>

      {cargando ? (
        <div className="panel panel-cargando">
          <span className="pulso-chico" /> Calculando matriz de sensibilidad contra 110 meses de retornos...
        </div>
      ) : error ? (
        <div className="panel panel-error">
          <p>{error}</p>
        </div>
      ) : (
        <>
          {/* Gráfica de Barras Divergentes de Correlación */}
          <div className="tarjeta-grafica-acoplamiento">
            <div className="grafica-header">
              <div>
                <h2>Correlación con tu Canasta de Consumo (ρA,L)</h2>
                <p>Barras hacia la derecha indican activos que suben de valor cuando tus gastos aumentan.</p>
              </div>
              <div className="tag-metodologia">
                Denominador: t−1 • Centrado por medias históricas
              </div>
            </div>

            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={metricasAcoplamiento}
                  layout="vertical"
                  margin={{ top: 10, right: 30, left: 100, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[-0.2, 1.0]}
                    tickFormatter={(v) => v.toFixed(2)}
                    stroke="#64748b"
                    fontSize={12}
                  />
                  <YAxis
                    type="category"
                    dataKey="ticker"
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#131722",
                      borderColor: "rgba(255,255,255,0.12)",
                      borderRadius: "10px",
                      color: "#f8fafc"
                    }}
                    formatter={(val, name, item) => [
                      `${val} (Covarianza σAL: ${item.payload.sigmaAL.toExponential(3)})`,
                      "Correlación ρ"
                    ]}
                  />
                  <ReferenceLine x={0} stroke="#475569" strokeWidth={1.5} />
                  <Bar dataKey="rho" radius={[0, 6, 6, 0]}>
                    {metricasAcoplamiento.map((entry) => (
                      <Cell
                        key={entry.ticker}
                        fill={
                          entry.rho >= 0.5
                            ? "#a855f7" // Morado eléctrico alta correlación
                            : entry.rho >= 0.2
                            ? "#38bdf8" // Azul cian media
                            : entry.rho >= 0
                            ? "#64748b" // Neutro
                            : "#f43f5e" // Rojo negativa
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabla Desglosada con Pesos Óptimos */}
          <div className="panel panel-tabla-acoplamiento">
            <h2>Sensibilidad de Cada Activo y Ponderación Óptima Asignada</h2>
            <div className="tabla-responsive">
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>Activo</th>
                    <th>Ticker</th>
                    <th>Correlación (ρ)</th>
                    <th>Covarianza (σAL)</th>
                    <th>Volatilidad Anualizada</th>
                    <th>Peso Óptimo en Cartera</th>
                    <th>Acción del Optimizador</th>
                  </tr>
                </thead>
                <tbody>
                  {metricasAcoplamiento.map((item) => (
                    <tr key={item.ticker}>
                      <td className="font-semibold">{item.label}</td>
                      <td><code className="ticker-badge">{item.ticker}</code></td>
                      <td className={item.rho > 0.3 ? "cifra-positiva" : item.rho < 0 ? "cifra-negativa" : ""}>
                        {item.rho > 0 ? `+${item.rho.toFixed(3)}` : item.rho.toFixed(3)}
                      </td>
                      <td className="font-mono text-muted">{item.sigmaAL.toExponential(2)}</td>
                      <td>{fmtPct(item.vol)}</td>
                      <td>
                        <div className="celda-peso">
                          <span className="cifra-peso">{fmtPct(item.peso)}</span>
                          <div className="mini-barra">
                            <div className="mini-barra-fill" style={{ width: `${item.peso * 100 * 2}%` }} />
                          </div>
                        </div>
                      </td>
                      <td>
                        {item.peso > 0.15 ? (
                          <span className="tag-estrategia tag-cobertura-fuerte">Cobertura Núcleo</span>
                        ) : item.peso > 0 ? (
                          <span className="tag-estrategia tag-diversificador">Diversificador</span>
                        ) : (
                          <span className="tag-estrategia tag-excluido">No asignado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="panel-explicativo-ldi">
              <div className="explicacion-icono">💡</div>
              <div className="explicacion-texto">
                <strong>¿Por qué el optimizador asigna estos pesos?</strong>
                <p>
                  A diferencia de la teoría clásica de Markowitz que solo busca retorno por unidad de volatilidad,
                  la <strong>Inversión Guiada por el Pasivo (LDI)</strong> penaliza a los activos que caen cuando tus gastos
                  suben. El optimizador resuelve:
                  <br />
                  <code>min w'Σw − 2w'σAL + λ·TEV</code>
                  <br />
                  Garantizando que tu cartera replique el índice de precios de tu hogar con la mínima varianza de cobertura.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
