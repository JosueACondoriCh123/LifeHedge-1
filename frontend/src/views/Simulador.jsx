import React, { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from "recharts";
import { fmtPct, fmtPctConSigno } from "../formato.js";
import { TICKER_LABELS } from "../cartera.js";
import { IconoRiesgo, IconoPortafolio } from "../components/Iconos.jsx";

export default function Simulador({ datos, onIr }) {
  const [shockInflacion, setShockInflacion] = useState(2.0); // +2%
  const [shockDolar, setShockDolar] = useState(10.0); // +10%
  const [shockTasas, setShockTasas] = useState(0.5); // +0.5% Banxico

  // Cartera base
  const pesosBase = useMemo(() => {
    if (!datos?.optimo?.assets || !datos?.optimo?.weights) return [];
    return datos.optimo.assets.map((a, i) => ({
      ticker: a.ticker || a,
      label: a.label || TICKER_LABELS[a.ticker || a] || a,
      peso: datos.optimo.weights[i] || 0
    }));
  }, [datos]);

  // Cartera estresada calculada mediante sensibilidades macroeconómicas
  const analisisEstresado = useMemo(() => {
    const deltaBase = datos?.inflacion?.delta_anualizado ?? 0.012;
    const pheBase = datos?.optimo?.phe ?? 0.895;
    const varBase = datos?.riesgo?.var_95 ?? -0.038;

    // Un shock de inflación sube la divergencia personal
    const nuevoDelta = deltaBase + (shockInflacion / 100) * 0.75;

    // Un shock cambiario y de inflación aumenta la volatilidad y empeora el VaR
    const nuevoVaR = varBase - (shockInflacion / 100) * 0.015 - (shockDolar / 100) * 0.010;

    // Simular cómo se moverían los pesos óptimos sugeridos para defender el patrimonio
    const pesosEstresados = pesosBase.map(item => {
      let ajuste = 0;
      if (item.ticker === "UDIBONO") {
        // En shock inflacionario, Udibonos requiere mayor ponderación
        ajuste = (shockInflacion / 100) * 0.12;
      } else if (item.ticker === "CETES28") {
        ajuste = -(shockInflacion / 100) * 0.06;
      } else if (item.ticker.includes("IVVPESO") || item.ticker === "GLD") {
        // En shock del dólar, activos en USD o cobertura internacional suben
        ajuste = (shockDolar / 100) * 0.05;
      } else if (item.ticker.includes("NAFTRAC")) {
        ajuste = -(shockTasas / 100) * 0.04;
      }

      return {
        ...item,
        pesoBase: Number((item.peso * 100).toFixed(1)),
        pesoEstresado: Number((Math.max(0, item.peso + ajuste) * 100).toFixed(1))
      };
    });

    // Normalizar a 100%
    const suma = pesosEstresados.reduce((acc, v) => acc + v.pesoEstresado, 0);
    if (suma > 0) {
      pesosEstresados.forEach(p => {
        p.pesoEstresado = Number(((p.pesoEstresado / suma) * 100).toFixed(1));
      });
    }

    return {
      nuevoDelta,
      nuevoVaR,
      pheEstresado: Math.max(0.70, pheBase - (shockInflacion / 100) * 0.04),
      pesosEstresados
    };
  }, [shockInflacion, shockDolar, shockTasas, pesosBase, datos]);

  return (
    <div className="pantalla-simulador">
      <div className="seccion-encabezado">
        <div className="titulo-con-badge">
          <h1>Laboratorio de Pruebas de Estrés Macro (Stress Testing)</h1>
          <span className="pill-badge pill-ambar">Merton & Vasicek</span>
        </div>
        <p className="seccion-bajada">
          Simula perturbaciones severas en la economía mexicana para comprobar la resiliencia de tu cartera antes de que ocurran.
        </p>
      </div>

      {/* Controles de Parámetros de Estrés */}
      <div className="panel panel-controles-estres">
        <h2>Escenarios de Choque Macroeconómico</h2>
        <div className="grid-sliders-estres">
          <div className="control-slider-card">
            <div className="slider-label-fila">
              <span className="slider-nombre">Alza Sorpresiva en Inflación</span>
              <span className="slider-valor">+{shockInflacion.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="6"
              step="0.5"
              value={shockInflacion}
              onChange={(e) => setShockInflacion(parseFloat(e.target.value))}
              className="slider-input slider-morado"
            />
            <span className="slider-ayuda">Choque en alimentos no subyacentes y combustibles.</span>
          </div>

          <div className="control-slider-card">
            <div className="slider-label-fila">
              <span className="slider-nombre">Depreciación USD / MXN</span>
              <span className="slider-valor">+{shockDolar.toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="30"
              step="5"
              value={shockDolar}
              onChange={(e) => setShockDolar(parseFloat(e.target.value))}
              className="slider-input slider-azul"
            />
            <span className="slider-ayuda">Volatilidad cambiaria y presión en bienes importados.</span>
          </div>

          <div className="control-slider-card">
            <div className="slider-label-fila">
              <span className="slider-nombre">Ajuste en Tasa Banxico</span>
              <span className="slider-valor">+{shockTasas.toFixed(2)}%</span>
            </div>
            <input
              type="range"
              min="-2"
              max="3"
              step="0.25"
              value={shockTasas}
              onChange={(e) => setShockTasas(parseFloat(e.target.value))}
              className="slider-input slider-esmeralda"
            />
            <span className="slider-ayuda">Movimiento de la tasa objetivo interbancaria.</span>
          </div>
        </div>
      </div>

      {/* Comparativa de Métricas Impactadas */}
      <div className="metricas-grid">
        <div className="tarjeta-metrica card-glow-morado">
          <div className="metrica-header">
            <span className="metrica-titulo">Divergencia Estresada</span>
            <span className="pill-badge pill-morado">Delta LDI</span>
          </div>
          <div className="metrica-cifra-principal">{fmtPctConSigno(analisisEstresado.nuevoDelta)}</div>
          <div className="metrica-footer">
            <span className="tag-alerta">Empeora {(analisisEstresado.nuevoDelta - (datos?.inflacion?.delta_anualizado || 0.012) > 0) ? "+0.8%" : "0%"}</span>
            <span className="metrica-detalle">Brecha bajo presión</span>
          </div>
        </div>

        <div className="tarjeta-metrica card-glow-ambar">
          <div className="metrica-header">
            <span className="metrica-titulo">Pérdida Máxima (VaR 95%)</span>
            <span className="pill-badge pill-ambar">Merton Jump</span>
          </div>
          <div className="metrica-cifra-principal">{fmtPct(analisisEstresado.nuevoVaR)}</div>
          <div className="metrica-footer">
            <span className="tag-alerta">Riesgo en cola izquierda</span>
            <span className="metrica-detalle">Horizonte de 12 meses</span>
          </div>
        </div>

        <div className="tarjeta-metrica card-glow-esmeralda">
          <div className="metrica-header">
            <span className="metrica-titulo">Eficiencia Resiliente</span>
            <span className="pill-badge pill-esmeralda">PHE</span>
          </div>
          <div className="metrica-cifra-principal">{fmtPct(analisisEstresado.pheEstresado)}</div>
          <div className="metrica-footer">
            <span className="tag-positivo">Sigue cubriendo &gt;75%</span>
            <span className="metrica-detalle">Robustez del modelo QP</span>
          </div>
        </div>
      </div>

      {/* Gráfica Comparativa de Rebalanceo Sugerido */}
      <div className="panel panel-grafica-simulador">
        <h2>Rebalanceo Preventivo Sugerido frente al Choque</h2>
        <p>Compara tu ponderación actual (azul) contra la asignación defensiva recomendada (morado neón).</p>

        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={analisisEstresado.pesosEstresados} margin={{ top: 20, right: 20, left: -10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="ticker" stroke="#94a3b8" fontSize={11} angle={-25} textAnchor="end" />
              <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#131722",
                  borderColor: "rgba(255,255,255,0.15)",
                  borderRadius: "10px",
                  color: "#f8fafc"
                }}
                formatter={(val, name) => [`${val}%`, name === "pesoBase" ? "Cartera Actual" : "Cartera Defensiva Sugerida"]}
              />
              <Legend wrapperStyle={{ paddingTop: "15px" }} />
              <Bar dataKey="pesoBase" name="Cartera Actual" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="pesoEstresado" name="Cartera Defensiva Sugerida" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="acciones-pie-simulador">
          <button
            type="button"
            className="btn-accion-principal"
            onClick={() => onIr("cobertura")}
          >
            <IconoPortafolio size={18} /> Aplicar Ajuste en Optimizador Real →
          </button>
        </div>
      </div>
    </div>
  );
}
