import React, { useEffect, useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from "recharts";
import { getUniverse } from "../api/client.js";
import { fmtPct } from "../formato.js";
import { TICKER_LABELS } from "../cartera.js";
import StaleBadge from "../components/StaleBadge.jsx";

const COLORES_ACTIVOS = {
  UDIBONO: "#a855f7",
  CETES28: "#38bdf8",
  "NAFTRACISHRS.MX": "#10b981",
  "IVVPESOISHRS.MX": "#f59e0b",
  GLD: "#eab308",
  XLE: "#f97316",
  DBA: "#84cc16",
  "MXN=X": "#ec4899",
};

export default function Mercado() {
  const [universo, setUniverso] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [activosVisibles, setActivosVisibles] = useState({
    UDIBONO: true,
    CETES28: true,
    "IVVPESOISHRS.MX": true,
    "NAFTRACISHRS.MX": false,
    GLD: false,
    XLE: false,
    DBA: false,
    "MXN=X": false,
  });

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

  const alternarActivo = (ticker) => {
    setActivosVisibles((prev) => ({
      ...prev,
      [ticker]: !prev[ticker],
    }));
  };

  // Datos para la gráfica de retornos históricos acumulados o mensuales
  const datosGrafica = useMemo(() => {
    if (!universo?.dates || !universo?.returns) return [];
    const fechas = universo.dates;
    const tickers = Object.keys(universo.returns);

    // Calcular índice acumulado base 100 para comparar trayectorias reales
    const acumulados = {};
    tickers.forEach((t) => {
      acumulados[t] = 100;
    });

    return fechas.map((f, i) => {
      const punto = { fecha: f.substring(0, 7) };
      tickers.forEach((t) => {
        const ret = universo.returns[t][i] || 0;
        acumulados[t] = acumulados[t] * (1 + ret);
        punto[t] = Number(acumulados[t].toFixed(2));
      });
      return punto;
    });
  }, [universo]);

  // Resumen estadístico de cada activo (rendimiento acumulado, volatilidad)
  const estadisticas = useMemo(() => {
    if (!universo?.assets || !universo?.returns) return [];
    return universo.assets.map((asset) => {
      const ticker = asset.ticker;
      const serie = universo.returns[ticker] || [];
      const n = serie.length;
      if (n === 0) return { ticker, label: asset.label, vol: 0, retMedio: 0 };

      const media = serie.reduce((a, b) => a + b, 0) / n;
      const varianza = serie.reduce((acc, v) => acc + Math.pow(v - media, 2), 0) / (n - 1);
      const volAnual = Math.sqrt(varianza) * Math.sqrt(12);
      const retAnual = Math.pow(1 + media, 12) - 1;

      return {
        ticker,
        label: asset.label || TICKER_LABELS[ticker] || ticker,
        volAnual,
        retAnual,
        color: COLORES_ACTIVOS[ticker] || "#94a3b8",
      };
    });
  }, [universo]);

  return (
    <div className="pantalla-mercado">
      <div className="seccion-encabezado">
        <div className="titulo-con-badge">
          <h1>Universo de Mercado y Activos de Cobertura</h1>
          {universo?.stale && <StaleBadge asOf={universo.as_of} />}
        </div>
        <p className="seccion-bajada">
          Series mensuales oficiales de Banxico, INEGI y mercados globales calibradas para la economía mexicana.
        </p>
      </div>

      {cargando ? (
        <div className="panel panel-cargando">
          <span className="pulso-chico" /> Cargando 110 meses de retornos del mercado...
        </div>
      ) : error ? (
        <div className="panel panel-error">
          <p>{error}</p>
        </div>
      ) : (
        <>
          {/* Gráfica de Retornos Acumulados */}
          <div className="tarjeta-mercado-grafica">
            <div className="grafica-header">
              <div>
                <h2>Evolución Histórica Acumulada (Base 100)</h2>
                <p>Haz clic en los filtros para comparar la trayectoria de crecimiento frente a la inflación.</p>
              </div>
              <div className="pills-activos-filtro">
                {estadisticas.map((item) => (
                  <button
                    key={item.ticker}
                    type="button"
                    className={`btn-ticker-toggle ${activosVisibles[item.ticker] ? "activo" : ""}`}
                    style={{
                      borderColor: activosVisibles[item.ticker] ? item.color : "rgba(255,255,255,0.1)",
                      backgroundColor: activosVisibles[item.ticker] ? `${item.color}22` : "transparent",
                      color: activosVisibles[item.ticker] ? item.color : "#94a3b8"
                    }}
                    onClick={() => alternarActivo(item.ticker)}
                  >
                    <span className="dot" style={{ backgroundColor: item.color }} />
                    {item.ticker}
                  </button>
                ))}
              </div>
            </div>

            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={datosGrafica} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="fecha" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#131722",
                      borderColor: "rgba(255,255,255,0.15)",
                      borderRadius: "10px",
                      color: "#f8fafc"
                    }}
                  />
                  {estadisticas.map((item) =>
                    activosVisibles[item.ticker] ? (
                      <Line
                        key={item.ticker}
                        type="monotone"
                        dataKey={item.ticker}
                        name={item.label}
                        stroke={item.color}
                        strokeWidth={2}
                        dot={false}
                      />
                    ) : null
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tarjetas de los 8 Activos */}
          <div className="grid-activos-tarjetas">
            {estadisticas.map((item) => (
              <div key={item.ticker} className="tarjeta-activo-card">
                <div className="activo-card-header">
                  <span className="ticker-pill" style={{ color: item.color, borderColor: `${item.color}55` }}>
                    {item.ticker}
                  </span>
                  <span className="activo-card-vol">Vol: {fmtPct(item.volAnual)}</span>
                </div>
                <h3 className="activo-card-nombre">{item.label}</h3>
                <div className="activo-card-cifras">
                  <div className="card-cifra-item">
                    <span className="cifra-label">Retorno Anualizado</span>
                    <span className="cifra-val">{fmtPct(item.retAnual)}</span>
                  </div>
                  <div className="card-cifra-item">
                    <span className="cifra-label">Función en Cartera</span>
                    <span className="cifra-desc">
                      {item.ticker === "UDIBONO"
                        ? "Cobertura inflacionaria primaria"
                        : item.ticker === "CETES28"
                        ? "Colchón de liquidez inmediata"
                        : item.ticker.includes("SPDR") || item.ticker === "GLD"
                        ? "Preservación de valor global"
                        : item.ticker.includes("XLE") || item.ticker === "DBA"
                        ? "Hedge de energía y alimentos"
                        : "Crecimiento patrimonial indexado"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
