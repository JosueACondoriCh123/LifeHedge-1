import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useSesion } from "../auth/SesionProvider.jsx";
import { getComparativeScenarios } from "../api/client.js";
import { leerAnalisis, listarAnalisis } from "../datos/analisis.js";
import { fmtFecha, fmtPct, fmtPctConSigno, fmtPuntos } from "../formato.js";
import { ETIQUETAS_RUBRO, RUBROS } from "../rubros.js";

// Colores validados para contraste y daltonismo
const COLOR_A = "var(--serie-cartera, #38bdf8)";
const COLOR_B = "var(--serie-efectivo, #a855f7)";

const ESCENARIOS_PREDEFINIDOS = [
  {
    id: "esc-base",
    etiqueta: "Cartera Base LDI (Consumo Balanceado)",
    categoria: "Modelo Institucional",
    delta_anualizado: 0.0006,
    phe: 0.812,
    tev: 0.0235,
    riesgo: { var_95: 0.0075 },
    pesos: {
      alimentos: 0.28,
      vivienda: 0.20,
      transporte: 0.16,
      educacion: 0.10,
      salud: 0.08,
      ropa: 0.05,
      esparcimiento: 0.08,
      otros: 0.05,
    },
    optimo: {
      phe: 0.812,
      tev: 0.0235,
      assets: [
        { ticker: "UDIBONO", label: "Udibonos 10Y" },
        { ticker: "CETES28", label: "Cetes 28D" },
        { ticker: "BONOS_M", label: "Bonos M 10Y" },
        { ticker: "IVVPESOISHRS.MX", label: "S&P 500 (MXN)" },
        { ticker: "GLD", label: "Oro Físico" },
        { ticker: "NAFTRACISHRS.MX", label: "IPC BMV" },
      ],
      weights: [0.42, 0.25, 0.10, 0.13, 0.05, 0.05],
    },
  },
  {
    id: "esc-alimentos",
    etiqueta: "Cartera Anti-Inflación (Sesgo Alimentos & Agro)",
    categoria: "Choque Sectorial",
    delta_anualizado: 0.0185,
    phe: 0.895,
    tev: 0.0195,
    riesgo: { var_95: 0.0062 },
    pesos: {
      alimentos: 0.45,
      vivienda: 0.18,
      transporte: 0.18,
      educacion: 0.05,
      salud: 0.06,
      ropa: 0.03,
      esparcimiento: 0.03,
      otros: 0.02,
    },
    optimo: {
      phe: 0.895,
      tev: 0.0195,
      assets: [
        { ticker: "UDIBONO", label: "Udibonos 10Y" },
        { ticker: "CETES28", label: "Cetes 28D" },
        { ticker: "BONOS_M", label: "Bonos M 10Y" },
        { ticker: "IVVPESOISHRS.MX", label: "S&P 500 (MXN)" },
        { ticker: "GLD", label: "Oro Físico" },
        { ticker: "DBA", label: "Commodities Agrícolas" },
      ],
      weights: [0.60, 0.18, 0.04, 0.08, 0.04, 0.06],
    },
  },
  {
    id: "esc-dolar",
    etiqueta: "Cartera Cobertura Dólar (Vulnerabilidad Cambiaria)",
    categoria: "Choque Macroeconómico",
    delta_anualizado: -0.004,
    phe: 0.748,
    tev: 0.031,
    riesgo: { var_95: 0.012 },
    pesos: {
      alimentos: 0.22,
      vivienda: 0.24,
      transporte: 0.16,
      educacion: 0.12,
      salud: 0.10,
      ropa: 0.06,
      esparcimiento: 0.06,
      otros: 0.04,
    },
    optimo: {
      phe: 0.748,
      tev: 0.031,
      assets: [
        { ticker: "UDIBONO", label: "Udibonos 10Y" },
        { ticker: "CETES28", label: "Cetes 28D" },
        { ticker: "IVVPESOISHRS.MX", label: "S&P 500 (MXN)" },
        { ticker: "GLD", label: "Oro Físico" },
        { ticker: "XLE", label: "Energía Global" },
      ],
      weights: [0.30, 0.15, 0.35, 0.12, 0.08],
    },
  },
  {
    id: "esc-conservador",
    etiqueta: "Cartera Máxima Liquidez (Cetes & Corto Plazo)",
    categoria: "Tasa Fija Banxico",
    delta_anualizado: -0.0015,
    phe: 0.68,
    tev: 0.015,
    riesgo: { var_95: 0.0035 },
    pesos: {
      alimentos: 0.30,
      vivienda: 0.22,
      transporte: 0.15,
      educacion: 0.08,
      salud: 0.08,
      ropa: 0.05,
      esparcimiento: 0.06,
      otros: 0.06,
    },
    optimo: {
      phe: 0.68,
      tev: 0.015,
      assets: [
        { ticker: "UDIBONO", label: "Udibonos 10Y" },
        { ticker: "CETES28", label: "Cetes 28D" },
        { ticker: "BONOS_M", label: "Bonos M 10Y" },
      ],
      weights: [0.20, 0.70, 0.10],
    },
  },
];

/** Métricas cuantitativas enfrentadas */
const METRICAS = [
  {
    clave: "delta",
    etiqueta: "Delta de Divergencia",
    leer: (a) => a.delta_anualizado ?? a.inflacion?.delta_anualizado,
    formato: fmtPctConSigno,
    mejorSi: "menor",
  },
  {
    clave: "phe",
    etiqueta: "Eficiencia de Cobertura (PHE)",
    leer: (a) => a.phe ?? a.optimo?.phe,
    formato: fmtPct,
    mejorSi: "mayor",
  },
  {
    clave: "tev",
    etiqueta: "Tracking Error (TEV)",
    leer: (a) => a.tev ?? a.optimo?.tev,
    formato: fmtPct,
    mejorSi: "menor",
  },
  {
    clave: "var",
    etiqueta: "Pérdida Máxima Estimada (VaR 95%)",
    leer: (a) => a.riesgo?.var_95,
    formato: fmtPct,
    mejorSi: "menor",
  },
];

export default function Comparar({ datosActuales, onIr, onCargarEnPortafolio }) {
  const { sesion } = useSesion();

  const [analisisGuardados, setAnalisisGuardados] = useState([]);
  const [escenariosDinamicos, setEscenariosDinamicos] = useState(ESCENARIOS_PREDEFINIDOS);
  const [idA, setIdA] = useState("actual");
  const [idB, setIdB] = useState("esc-alimentos");
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [error, setError] = useState(null);
  const [mensajeAccion, setMensajeAccion] = useState(null);

  // Cargar escenarios comparativos dinámicos calculados al vuelo por el motor cuantitativo
  useEffect(() => {
    let cancelado = false;
    getComparativeScenarios(0.10, 12)
      .then((datos) => {
        if (!cancelado && Array.isArray(datos) && datos.length > 0) {
          setEscenariosDinamicos(datos);
        }
      })
      .catch(() => {
        // En caso de indisponibilidad temporal, preserva modelos de referencia
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Cargar análisis guardados en Supabase si hay sesión activa
  useEffect(() => {
    if (!sesion) return;
    listarAnalisis()
      .then((filas) => {
        if (filas?.length > 0) {
          setAnalisisGuardados(filas);
        }
      })
      .catch((e) => setError(e.message));
  }, [sesion]);

  // Construir objeto dinámico del análisis actual en vivo
  const carteraActual = useMemo(() => {
    if (!datosActuales) return null;
    return {
      id: "actual",
      etiqueta: "Cartera Activa (Sesión en Vivo)",
      categoria: "En Tiempo Real",
      delta_anualizado: datosActuales.inflacion?.delta_anualizado ?? 0.0006,
      phe: datosActuales.optimo?.phe ?? 0.812,
      tev: datosActuales.optimo?.tev ?? 0.0235,
      riesgo: datosActuales.riesgo ?? { var_95: 0.0075 },
      pesos: datosActuales.pesos ?? {},
      optimo: datosActuales.optimo ?? null,
    };
  }, [datosActuales]);

  // Cargar objeto para el slot A
  useEffect(() => {
    if (idA === "actual") {
      setA(carteraActual || escenariosDinamicos[0] || ESCENARIOS_PREDEFINIDOS[0]);
    } else {
      const pred =
        escenariosDinamicos.find((e) => e.id === idA) ||
        ESCENARIOS_PREDEFINIDOS.find((e) => e.id === idA);
      if (pred) {
        setA(pred);
      } else {
        leerAnalisis(idA).then(setA).catch((e) => setError(e.message));
      }
    }
  }, [idA, carteraActual, escenariosDinamicos]);

  // Cargar objeto para el slot B
  useEffect(() => {
    if (idB === "actual") {
      setB(carteraActual || escenariosDinamicos[1] || ESCENARIOS_PREDEFINIDOS[1]);
    } else {
      const pred =
        escenariosDinamicos.find((e) => e.id === idB) ||
        ESCENARIOS_PREDEFINIDOS.find((e) => e.id === idB);
      if (pred) {
        setB(pred);
      } else {
        leerAnalisis(idB).then(setB).catch((e) => setError(e.message));
      }
    }
  }, [idB, carteraActual, escenariosDinamicos]);

  // Canasta de gasto agrupada para Recharts
  const canasta = useMemo(() => {
    if (!a || !b) return [];
    return RUBROS.map((rubro) => ({
      rubro: ETIQUETAS_RUBRO[rubro] || rubro,
      A: Number(((a.pesos?.[rubro] ?? 0) * 100).toFixed(1)),
      B: Number(((b.pesos?.[rubro] ?? 0) * 100).toFixed(1)),
    }));
  }, [a, b]);

  // Ponderación de activos combinando activos de A y B
  const cartera = useMemo(() => {
    if (!a?.optimo || !b?.optimo) return [];
    const activosA = a.optimo.assets || [];
    const pesosA = a.optimo.weights || [];
    const activosB = b.optimo.assets || [];
    const pesosB = b.optimo.weights || [];

    const mapa = new Map();
    activosA.forEach((act, i) => {
      const ticker = act.ticker || act;
      const label = act.label || ticker;
      mapa.set(ticker, { etiqueta: label, ticker, pesoA: pesosA[i] ?? 0, pesoB: 0 });
    });
    activosB.forEach((act, i) => {
      const ticker = act.ticker || act;
      const label = act.label || ticker;
      if (mapa.has(ticker)) {
        mapa.get(ticker).pesoB = pesosB[i] ?? 0;
      } else {
        mapa.set(ticker, { etiqueta: label, ticker, pesoA: 0, pesoB: pesosB[i] ?? 0 });
      }
    });

    return Array.from(mapa.values()).sort((x, y) => (y.pesoA + y.pesoB) - (x.pesoA + x.pesoB));
  }, [a, b]);

  const intercambiar = () => {
    const temp = idA;
    setIdA(idB);
    setIdB(temp);
  };

  const exportarCSV = () => {
    if (!a || !b) return;
    const lineas = [
      `"Comparativa de Carteras LifeHedge LDI"`,
      `"Generado:", "${new Date().toLocaleString("es-MX")}"`,
      `"Escenario A:", "${a.etiqueta}"`,
      `"Escenario B:", "${b.etiqueta}"`,
      "",
      `"METRICA","${a.etiqueta}","${b.etiqueta}","DIFERENCIA"`,
    ];

    METRICAS.forEach((m) => {
      const va = m.leer(a);
      const vb = m.leer(b);
      if (typeof va === "number" && typeof vb === "number") {
        const dif = vb - va;
        lineas.push(`"${m.etiqueta}","${m.formato(va)}","${m.formato(vb)}","${fmtPuntos(dif)}"`);
      }
    });

    lineas.push("");
    lineas.push(`"ACTIVO","TICKER","PESO A","PESO B","DIFERENCIA"`);
    cartera.forEach((c) => {
      const dif = c.pesoB - c.pesoA;
      lineas.push(`"${c.etiqueta}","${c.ticker}","${fmtPct(c.pesoA)}","${fmtPct(c.pesoB)}","${fmtPuntos(dif)}"`);
    });

    const blob = new Blob([lineas.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `comparativa_lifehedge_${idA}_vs_${idB}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setMensajeAccion("CSV de comparativa descargado con éxito.");
    setTimeout(() => setMensajeAccion(null), 4000);
  };

  const handleCargarEnPortafolio = () => {
    if (!b?.pesos || !onCargarEnPortafolio) return;
    onCargarEnPortafolio(b.pesos);
    setMensajeAccion(`Canasta de "${b.etiqueta}" cargada en tu portafolio activo.`);
    setTimeout(() => setMensajeAccion(null), 4000);
  };

  return (
    <section className="vista">
      <div className="vista__encabezado">
        <div>
          <div className="badge-seccion-neon">
            LABORATORIO COMPARATIVO MULTI-ESCENARIO
          </div>
          <h2>Comparador de Estrategias y Escenarios LDI</h2>
          <p className="subtitulo-vista">
            Contrasta simultáneamente dos carteras para evaluar su eficiencia de cobertura (PHE), riesgo de cola y desvío de ponderaciones.
          </p>
        </div>
      </div>

      {!sesion && (
        <div className="panel" style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.2)", marginBottom: "16px" }}>
          <p style={{ margin: 0, fontSize: "0.88rem", color: "#38bdf8" }}>
            <strong>Modo Demostración Activo:</strong> Estás comparando modelos de referencia institucionales predefinidos. Inicia sesión en cualquier momento para guardar y contrastar tus propios estados de cuenta mes con mes.
          </p>
        </div>
      )}

      {error ? (
        <div className="panel panel-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {mensajeAccion ? (
        <div style={{ padding: "10px 16px", background: "rgba(16,185,129,0.15)", borderRadius: "8px", color: "#10b981", fontSize: "0.88rem", marginBottom: "16px", border: "1px solid rgba(16,185,129,0.3)" }}>
          {mensajeAccion}
        </div>
      ) : null}

      {/* SELECTORES DE ESCENARIOS */}
      <div className="comparar-selectores" style={{ display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="campo" style={{ flex: 1, minWidth: "260px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "600" }}>
            <i className="muestra-color" style={{ background: COLOR_A, display: "inline-block", width: "12px", height: "12px", borderRadius: "3px" }} />
            Escenario Base (A)
          </span>
          <select value={idA} onChange={(e) => setIdA(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px" }}>
            {carteraActual && (
              <optgroup label="Sesión Actual">
                <option value="actual">Cartera Activa (Sesión en Vivo)</option>
              </optgroup>
            )}
            <optgroup label="Modelos Institucionales Dinámicos">
              {escenariosDinamicos.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.etiqueta}
                </option>
              ))}
            </optgroup>
            {analisisGuardados.length > 0 && (
              <optgroup label="Tus Análisis Guardados en Supabase">
                {analisisGuardados.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etiqueta} · {fmtFecha(o.creado_en)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>

        <button
          type="button"
          className="boton-secundario"
          onClick={intercambiar}
          title="Intercambiar A y B"
          style={{ height: "42px", padding: "0 14px", alignSelf: "flex-end" }}
        >
          ⇄ Intercambiar
        </button>

        <label className="campo" style={{ flex: 1, minWidth: "260px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "600" }}>
            <i className="muestra-color" style={{ background: COLOR_B, display: "inline-block", width: "12px", height: "12px", borderRadius: "3px" }} />
            Escenario Contraste (B)
          </span>
          <select value={idB} onChange={(e) => setIdB(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px" }}>
            {carteraActual && (
              <optgroup label="Sesión Actual">
                <option value="actual">Cartera Activa (Sesión en Vivo)</option>
              </optgroup>
            )}
            <optgroup label="Modelos Institucionales Dinámicos">
              {escenariosDinamicos.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.etiqueta}
                </option>
              ))}
            </optgroup>
            {analisisGuardados.length > 0 && (
              <optgroup label="Tus Análisis Guardados en Supabase">
                {analisisGuardados.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etiqueta} · {fmtFecha(o.creado_en)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      </div>

      {/* BARRA DE ACCIONES RÁPIDAS */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px", marginBottom: "20px" }}>
        <button
          type="button"
          className="boton-secundario"
          onClick={exportarCSV}
          disabled={!a || !b}
          style={{ fontSize: "0.85rem" }}
        >
          Descargar Comparativa CSV
        </button>
        {onCargarEnPortafolio && b?.pesos && (
          <button
            type="button"
            className="boton-primario"
            onClick={handleCargarEnPortafolio}
            style={{ fontSize: "0.85rem" }}
          >
            Adoptar Canasta de B en mi Portafolio
          </button>
        )}
      </div>

      {a && b ? (
        <>
          {/* TABLA DE MÉTRICAS */}
          <div className="panel" style={{ marginBottom: "20px" }}>
            <h3>Matriz de Desempeño Cuantitativo</h3>
            <div className="tabla-desplazable" style={{ marginTop: "10px" }}>
              <table className="tabla tabla-comparacion">
                <thead>
                  <tr>
                    <th>Métrica Financiera</th>
                    <th>{a.etiqueta}</th>
                    <th>{b.etiqueta}</th>
                    <th>Diferencia Neta</th>
                  </tr>
                </thead>
                <tbody>
                  {METRICAS.map((m) => {
                    const va = m.leer(a);
                    const vb = m.leer(b);
                    if (typeof va !== "number" || typeof vb !== "number") return null;
                    const dif = vb - va;
                    const iguales = Math.abs(dif) < 0.005;
                    const mejora = m.mejorSi === "mayor" ? dif > 0 : dif < 0;
                    return (
                      <tr key={m.clave}>
                        <td><strong>{m.etiqueta}</strong></td>
                        <td style={{ color: COLOR_A, fontWeight: "600" }}>{m.formato(va)}</td>
                        <td style={{ color: COLOR_B, fontWeight: "600" }}>{m.formato(vb)}</td>
                        <td
                          className={
                            iguales
                              ? "cifra-tenue"
                              : mejora
                                ? "cifra-positiva"
                                : "cifra-alerta"
                          }
                          style={{ fontWeight: "bold" }}
                        >
                          {iguales ? (
                            "Sin variación significativa"
                          ) : (
                            <>
                              {mejora ? "▲" : "▼"} {fmtPuntos(Math.abs(dif))} {mejora ? "(Favorable)" : "(Menor cobertura)"}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* GRÁFICA COMPARATIVA DE CANASTA DE GASTO */}
          <section className="panel panel-grafica" style={{ marginBottom: "20px" }}>
            <h3>Distribución de la Canasta de Consumo (%)</h3>
            <p className="metrica-nota" style={{ margin: "4px 0 16px 0" }}>
              Compara cómo pondera cada rubro de gasto entre la Cartera A y la Cartera B.
            </p>
            <div className="alto-grafica" style={{ height: "320px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={canasta} margin={{ top: 8, right: 16, bottom: 25, left: 0 }}>
                  <CartesianGrid stroke="var(--linea)" vertical={false} />
                  <XAxis
                    dataKey="rubro"
                    tick={{ fontSize: 11, fill: "var(--tinta-suave)" }}
                    stroke="var(--linea)"
                    tickLine={false}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis
                    unit="%"
                    tick={{ fontSize: 11, fill: "var(--tinta-suave)" }}
                    stroke="var(--linea)"
                    tickLine={false}
                  />
                  <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                  <Bar dataKey="A" name={a.etiqueta} fill={COLOR_A} radius={[3, 3, 0, 0]} maxBarSize={38} />
                  <Bar dataKey="B" name={b.etiqueta} fill={COLOR_B} radius={[3, 3, 0, 0]} maxBarSize={38} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="leyenda" style={{ display: "flex", gap: "20px", listStyle: "none", padding: 0, marginTop: "12px", justifyContent: "center" }}>
              <li style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.88rem" }}>
                <i className="muestra" style={{ background: COLOR_A, width: "12px", height: "12px", display: "inline-block", borderRadius: "3px" }} />
                <span>{a.etiqueta}</span>
              </li>
              <li style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.88rem" }}>
                <i className="muestra" style={{ background: COLOR_B, width: "12px", height: "12px", display: "inline-block", borderRadius: "3px" }} />
                <span>{b.etiqueta}</span>
              </li>
            </ul>
          </section>

          {/* TABLA DE ASIGNACIÓN DE ACTIVOS */}
          <div className="panel" style={{ marginBottom: "20px" }}>
            <h3>Asignación de Activos y Desvío de Pesos</h3>
            <p className="metrica-nota" style={{ margin: "4px 0 12px 0" }}>
              Diferencia de ponderación en cada instrumento financiero del mercado mexicano.
            </p>
            <div className="tabla-desplazable">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Activo</th>
                    <th>Ticker</th>
                    <th>Ponderación en A</th>
                    <th>Ponderación en B</th>
                    <th>Variación Requerida</th>
                  </tr>
                </thead>
                <tbody>
                  {cartera.map((fila) => {
                    const dif = fila.pesoB - fila.pesoA;
                    const iguales = Math.abs(dif) < 0.005;
                    return (
                      <tr key={fila.ticker}>
                        <td><strong>{fila.etiqueta}</strong></td>
                        <td><span className="tag-rubro">{fila.ticker}</span></td>
                        <td>{fmtPct(fila.pesoA)}</td>
                        <td>{fmtPct(fila.pesoB)}</td>
                        <td
                          style={{
                            fontWeight: "bold",
                            color: iguales ? "var(--color-texto-apagado)" : dif > 0 ? "#10b981" : "#ef4444",
                          }}
                        >
                          {iguales ? "0.0%" : `${dif > 0 ? "+" : ""}${fmtPuntos(dif)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

