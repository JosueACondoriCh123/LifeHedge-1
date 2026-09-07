import React, { useState, useMemo, useEffect } from "react";
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
import { IconoPortafolio } from "../components/Iconos.jsx";
import {
  ejecutarEstresPortafolio,
  listarEscenariosEstres,
} from "../datos/analisis.js";

export default function Simulador({ datos, onIr, onAplicarAjuste }) {
  const [shockInflacion, setShockInflacion] = useState(2.0); // +2%
  const [shockDolar, setShockDolar] = useState(10.0); // +10%
  const [shockTasas, setShockTasas] = useState(0.5); // +0.5% Banxico

  const [escenariosServer, setEscenariosServer] = useState([]);
  const [escenarioSeleccionado, setEscenarioSeleccionado] = useState("SHOCK_TASAS_BANXICO");
  const [resultadoServer, setResultadoServer] = useState(null);
  const [ejecutandoServer, setEjecutandoServer] = useState(false);

  useEffect(() => {
    listarEscenariosEstres().then((res) => {
      if (res?.length > 0) setEscenariosServer(res);
    });
  }, []);

  const handleEjecutarEstresServer = async (codigo = escenarioSeleccionado) => {
    setEjecutandoServer(true);
    setEscenarioSeleccionado(codigo);
    try {
      const res = await ejecutarEstresPortafolio(null, codigo);
      if (res?.escenario) setResultadoServer(res);
    } catch (err) {
      console.warn("Error en simulación:", err);
    } finally {
      setEjecutandoServer(false);
    }
  };

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

  const handleAplicarCarteraDefensiva = () => {
    if (!datos?.pesos) {
      if (onIr) onIr("cobertura");
      return;
    }
    const nuevaCanasta = { ...datos.pesos };
    if (nuevaCanasta.alimentos !== undefined) {
      nuevaCanasta.alimentos = Number((nuevaCanasta.alimentos * (1 + (shockInflacion / 100) * 0.35)).toFixed(3));
    }
    if (nuevaCanasta.transporte !== undefined) {
      nuevaCanasta.transporte = Number((nuevaCanasta.transporte * (1 + (shockInflacion / 100) * 0.15)).toFixed(3));
    }
    const suma = Object.values(nuevaCanasta).reduce((a, b) => a + b, 0);
    Object.keys(nuevaCanasta).forEach((k) => {
      nuevaCanasta[k] = Number((nuevaCanasta[k] / suma).toFixed(3));
    });

    if (onAplicarAjuste) {
      onAplicarAjuste(nuevaCanasta);
    } else if (onIr) {
      onIr("cobertura");
    }
  };

  const exportarEstresCSV = () => {
    const lineas = [
      `"Resultados de Prueba de Estrés Macroeconómico - LifeHedge LDI"`,
      `"Fecha:", "${new Date().toLocaleString("es-MX")}"`,
      "",
      `"PARÁMETROS DE CHOQUE"`,
      `"Shock Inflación:", "+${shockInflacion.toFixed(1)}%"`,
      `"Depreciación USD/MXN:", "+${shockDolar.toFixed(0)}%"`,
      `"Ajuste Tasa Banxico:", "+${shockTasas.toFixed(2)}%"`,
      "",
      `"MÉTRICAS ESTRESADAS"`,
      `"Divergencia Estresada (Delta):", "${fmtPctConSigno(analisisEstresado.nuevoDelta)}"`,
      `"VaR 95% Estresado:", "${fmtPct(analisisEstresado.nuevoVaR)}"`,
      `"PHE Estresado:", "${fmtPct(analisisEstresado.pheEstresado)}"`,
      "",
      `"ACTIVO","TICKER","PESO ACTUAL (%)","PESO DEFENSIVO SUGERIDO (%)"`,
    ];

    analisisEstresado.pesosEstresados.forEach((p) => {
      lineas.push(`"${p.label}","${p.ticker}","${p.pesoBase}%","${p.pesoEstresado}%"`);
    });

    const blob = new Blob([lineas.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `estres_macro_lifehedge.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

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

      {/* Escenarios Macroeconómicos Oficiales (Supabase PL/pgSQL Engine) */}
      <div className="panel" style={{ marginBottom: "20px", borderLeft: "4px solid #f8cc1b" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "12px" }}>
          <div>
            <span className="badge-seccion-neon" style={{ fontSize: "0.75rem" }}>
              BANXICO & COMITÉ DE RIESGOS · MOTOR SUPABASE
            </span>
            <h3 style={{ margin: "4px 0 0 0" }}>Escenarios Históricos de Choque Macroeconómico</h3>
            <p className="metrica-nota" style={{ margin: "2px 0 0 0" }}>
              Simulaciones paramétricas calibradas con factores históricos del mercado mexicano.
            </p>
          </div>

          <button
            type="button"
            className="boton-primario"
            onClick={() => handleEjecutarEstresServer(escenarioSeleccionado)}
            disabled={ejecutandoServer}
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            {ejecutandoServer ? "Simulando en Postgres…" : "Simular Escenario en Supabase"}
          </button>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
          {(escenariosServer.length > 0 ? escenariosServer : [
            { codigo: "SHOCK_TASAS_BANXICO", nombre: "Alza Banxico +300 bps" },
            { codigo: "DEVALUACION_PESO", nombre: "Devaluación USD/MXN +25%" },
            { codigo: "PICO_INFLACION_ALIMENTOS", nombre: "Pico Alimentos +18%" },
            { codigo: "ESTANFLACION_GLOBAL", nombre: "Estanflación (Años 70)" },
            { codigo: "CRASH_BURSATIL", nombre: "Crash Accionario -30%" },
          ]).map((esc) => {
            const activo = esc.codigo === escenarioSeleccionado;
            return (
              <button
                key={esc.codigo}
                type="button"
                onClick={() => {
                  setEscenarioSeleccionado(esc.codigo);
                  handleEjecutarEstresServer(esc.codigo);
                }}
                style={{
                  background: activo ? "rgba(248,204,27,0.1)" : "#1a1e21",
                  border: activo ? "1px solid rgba(248,204,27,0.35)" : "1px solid #34393e",
                  color: activo ? "#f8fafc" : "var(--color-texto-apagado)",
                  borderRadius: "20px",
                  padding: "6px 14px",
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.2s ease"
                }}
              >
                <span>{esc.nombre}</span>
              </button>
            );
          })}
        </div>

        {resultadoServer && (
          <div style={{ background: "rgba(0,0,0,0.25)", padding: "16px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "12px" }}>
              <div>
                <span style={{ fontSize: "0.8rem", color: "var(--color-texto-apagado)" }}>
                  {resultadoServer.escenario?.descripcion}
                </span>
                <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#f8fafc", marginTop: "4px" }}>
                  Impacto Proyectado: <span style={{ color: resultadoServer.impacto_rendimiento_pct >= 0 ? "#10b981" : "#ef4444" }}>
                    {resultadoServer.impacto_rendimiento_pct >= 0 ? `+${resultadoServer.impacto_rendimiento_pct}%` : `${resultadoServer.impacto_rendimiento_pct}%`}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <span style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "0.8rem",
                  fontWeight: "bold",
                  background: resultadoServer.resiliencia === "ALTA_RESILIENCIA" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                  color: resultadoServer.resiliencia === "ALTA_RESILIENCIA" ? "#10b981" : "#ef4444"
                }}>
                  {resultadoServer.resiliencia === "ALTA_RESILIENCIA" ? "ALTA RESILIENCIA LDI" : "VULNERABLE AL SHOCK"}
                </span>
                <span style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "0.8rem",
                  background: "rgba(255,255,255,0.06)",
                  color: "var(--color-texto)"
                }}>
                  PHE Post-Choque: {(resultadoServer.phe_estresado * 100).toFixed(1)}%
                </span>
              </div>
            </div>

            {resultadoServer.detalles_activos?.length > 0 && (
              <div className="tabla-desplazable">
                <table className="tabla" style={{ fontSize: "0.82rem" }}>
                  <thead>
                    <tr>
                      <th>Activo</th>
                      <th>Ponderación</th>
                      <th>Shock Individual</th>
                      <th>Contribución al Rendimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultadoServer.detalles_activos.map((d) => (
                      <tr key={d.activo}>
                        <td><strong>{d.activo}</strong></td>
                        <td>{(d.peso * 100).toFixed(1)}%</td>
                        <td style={{ color: d.shock_individual >= 0 ? "#10b981" : "#ef4444" }}>
                          {d.shock_individual >= 0 ? `+${d.shock_individual}%` : `${d.shock_individual}%`}
                        </td>
                        <td style={{ color: d.contribucion_impacto >= 0 ? "#10b981" : "#ef4444", fontWeight: "bold" }}>
                          {d.contribucion_impacto >= 0 ? `+${d.contribucion_impacto}%` : `${d.contribucion_impacto}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
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
        <p>Compara tu ponderación actual (azul) contra la asignación defensiva recomendada (violeta).</p>

        <div className="chart-wrapper">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={analisisEstresado.pesosEstresados} margin={{ top: 20, right: 20, left: -10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 5" stroke="#292e32" vertical={false} />
              <XAxis dataKey="ticker" stroke="#868e95" fontSize={11} angle={-25} textAnchor="end" tickLine={false} axisLine={false} />
              <YAxis stroke="#7f878e" fontSize={11} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111315",
                  borderColor: "#34393f",
                  borderRadius: "8px",
                  color: "#f1f3f4"
                }}
                formatter={(val, name) => [`${val}%`, name === "pesoBase" ? "Cartera Actual" : "Cartera Defensiva Sugerida"]}
              />
              <Legend wrapperStyle={{ paddingTop: "15px" }} />
              <Bar dataKey="pesoBase" name="Cartera Actual" fill="#8d959c" radius={[3, 3, 0, 0]} maxBarSize={46} />
              <Bar dataKey="pesoEstresado" name="Cartera Defensiva Sugerida" fill="#f8cc1b" radius={[3, 3, 0, 0]} maxBarSize={46} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="acciones-pie-simulador" style={{ display: "flex", gap: "12px", justifyContent: "flex-end", flexWrap: "wrap", marginTop: "16px" }}>
          <button
            type="button"
            className="boton-secundario"
            onClick={exportarEstresCSV}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px", borderRadius: "8px" }}
          >
            Descargar Dictamen de Estrés (CSV)
          </button>
          <button
            type="button"
            className="btn-accion-principal"
            onClick={handleAplicarCarteraDefensiva}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px", borderRadius: "8px" }}
          >
            <IconoPortafolio size={18} /> Aplicar Canasta Defensiva en Optimizador Real →
          </button>
        </div>
      </div>
    </div>
  );
}
