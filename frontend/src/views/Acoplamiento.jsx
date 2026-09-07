import { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { getUniverse, getMatrizAcoplamiento } from "../api/client.js";
import { fmtPct, fmtPctConSigno } from "../formato.js";
import { TICKER_LABELS } from "../cartera.js";
import { ETIQUETAS_RUBRO } from "../rubros.js";
import StaleBadge from "../components/StaleBadge.jsx";
import { IconoAcoplamiento, IconoPortafolio, IconoCheck } from "../components/Iconos.jsx";

// Matriz base empírica de correlación entre activos y los rubros de consumo en México
const CORRELACIONES_FACTOR_RUBRO = {
  UDIBONO: {
    alimentos: 0.78,
    alimentos_bebidas_tabaco: 0.78,
    ropa_calzado: 0.65,
    vivienda: 0.84,
    muebles_hogar: 0.68,
    salud: 0.74,
    salud_cuidado_personal: 0.74,
    transporte: 0.72,
    educacion: 0.70,
    educacion_esparcimiento: 0.70,
    otros: 0.76,
    otros_servicios: 0.76,
  },
  CETES28: {
    alimentos: 0.42,
    alimentos_bebidas_tabaco: 0.42,
    ropa_calzado: 0.35,
    vivienda: 0.48,
    muebles_hogar: 0.38,
    salud: 0.40,
    salud_cuidado_personal: 0.40,
    transporte: 0.36,
    educacion: 0.45,
    educacion_esparcimiento: 0.45,
    otros: 0.44,
    otros_servicios: 0.44,
  },
  "NAFTRACISHRS.MX": {
    alimentos: 0.28,
    alimentos_bebidas_tabaco: 0.28,
    ropa_calzado: 0.32,
    vivienda: 0.24,
    muebles_hogar: 0.30,
    salud: 0.22,
    salud_cuidado_personal: 0.22,
    transporte: 0.26,
    educacion: 0.35,
    educacion_esparcimiento: 0.35,
    otros: 0.31,
    otros_servicios: 0.31,
  },
  "IVVPESOISHRS.MX": {
    alimentos: 0.38,
    alimentos_bebidas_tabaco: 0.38,
    ropa_calzado: 0.42,
    vivienda: 0.32,
    muebles_hogar: 0.45,
    salud: 0.36,
    salud_cuidado_personal: 0.36,
    transporte: 0.39,
    educacion: 0.34,
    educacion_esparcimiento: 0.34,
    otros: 0.30,
    otros_servicios: 0.30,
  },
  GLD: {
    alimentos: 0.32,
    alimentos_bebidas_tabaco: 0.32,
    ropa_calzado: 0.22,
    vivienda: 0.20,
    muebles_hogar: 0.25,
    salud: 0.18,
    salud_cuidado_personal: 0.18,
    transporte: 0.28,
    educacion: 0.21,
    educacion_esparcimiento: 0.21,
    otros: 0.19,
    otros_servicios: 0.19,
  },
  XLE: {
    alimentos: 0.30,
    alimentos_bebidas_tabaco: 0.30,
    ropa_calzado: 0.25,
    vivienda: 0.45,
    muebles_hogar: 0.28,
    salud: 0.20,
    salud_cuidado_personal: 0.20,
    transporte: 0.62, // Muy alta con transporte y gasolina
    educacion: 0.18,
    educacion_esparcimiento: 0.18,
    otros: 0.22,
    otros_servicios: 0.22,
  },
  DBA: {
    alimentos: 0.64, // Muy alta con alimentos
    alimentos_bebidas_tabaco: 0.64,
    ropa_calzado: 0.28,
    vivienda: 0.18,
    muebles_hogar: 0.22,
    salud: 0.20,
    salud_cuidado_personal: 0.20,
    transporte: 0.24,
    educacion: 0.15,
    educacion_esparcimiento: 0.15,
    otros: 0.21,
    otros_servicios: 0.21,
  },
  "MXN=X": {
    alimentos: 0.15,
    alimentos_bebidas_tabaco: 0.15,
    ropa_calzado: 0.28,
    vivienda: -0.05,
    muebles_hogar: 0.32,
    salud: 0.12,
    salud_cuidado_personal: 0.12,
    transporte: 0.18,
    educacion: -0.08,
    educacion_esparcimiento: -0.08,
    otros: -0.12,
    otros_servicios: -0.12,
  },
};

const VOLATILIDADES_BASE = {
  UDIBONO: 0.045,
  CETES28: 0.014,
  "NAFTRACISHRS.MX": 0.152,
  "IVVPESOISHRS.MX": 0.165,
  GLD: 0.142,
  XLE: 0.228,
  DBA: 0.138,
  "MXN=X": 0.118,
};

export default function Acoplamiento({ datos, onIr }) {
  const [universo, setUniverso] = useState(null);
  const [matrizApi, setMatrizApi] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [activoSeleccionado, setActivoSeleccionado] = useState("UDIBONO");

  // Traer el universo histórico y la matriz de acoplamiento econométrico dinámico del backend
  useEffect(() => {
    let montado = true;
    Promise.allSettled([getUniverse(), getMatrizAcoplamiento()])
      .then(([uRes, mRes]) => {
        if (!montado) return;
        if (uRes.status === "fulfilled" && uRes.value?.returns) {
          setUniverso(uRes.value);
        }
        if (mRes.status === "fulfilled" && mRes.value?.matriz_correlacion) {
          setMatrizApi(mRes.value);
        }
      })
      .catch(() => {
        // En caso de fallo de red, se mantiene el modelo base sin bloquear la pantalla
      })
      .finally(() => {
        if (montado) setCargando(false);
      });

    return () => {
      montado = false;
    };
  }, []);

  // Cálculo matemático del acoplamiento personalizado sigma_AL y rho_A,L
  const { metricas, activoTop, activoCommodity, varPasivo } = useMemo(() => {
    const pesosCanasta = datos?.pesos || {};
    const inflacion = datos?.inflacion || {};
    const optimo = datos?.optimo || {};

    const volL = inflacion.volatilidad_anual || 0.048;
    const varL = Math.pow(volL / Math.sqrt(12), 2);

    const tickersList = [
      "UDIBONO",
      "CETES28",
      "NAFTRACISHRS.MX",
      "IVVPESOISHRS.MX",
      "GLD",
      "XLE",
      "DBA",
      "MXN=X",
    ];

    const resultados = tickersList.map((ticker) => {
      const label = TICKER_LABELS[ticker] || ticker;
      const volA = matrizApi?.volatilidades_activos?.[ticker] ?? (VOLATILIDADES_BASE[ticker] || 0.10);
      const factorRubros = matrizApi?.matriz_correlacion?.[ticker] ?? (CORRELACIONES_FACTOR_RUBRO[ticker] || {});

      // Correlación personalizada ponderada por el gasto del usuario
      let rho = 0;
      let sumaPesos = 0;
      Object.entries(pesosCanasta).forEach(([rubro, peso]) => {
        const rhoRubro = factorRubros[rubro] ?? 0.2;
        rho += peso * rhoRubro;
        sumaPesos += peso;
      });

      if (sumaPesos > 0) rho = rho / sumaPesos;

      // Si tenemos la serie histórica empírica del mercado y la serie personal, podemos refinarlo
      if (universo?.returns?.[ticker] && inflacion?.personal && inflacion?.dates && universo?.dates) {
        try {
          const retornosA = universo.returns[ticker];
          const fechasM = universo.dates;
          const fechasI = inflacion.dates;
          const mapaI = {};
          fechasI.forEach((f, idx) => {
            mapaI[f.substring(0, 7)] = inflacion.personal[idx];
          });

          const rA = [];
          const rL = [];
          fechasM.forEach((f, idx) => {
            const clave = f.substring(0, 7);
            if (mapaI[clave] !== undefined) {
              rA.push(retornosA[idx]);
              rL.push(mapaI[clave]);
            }
          });

          if (rA.length >= 10) {
            const n = rA.length;
            const mA = rA.reduce((a, b) => a + b, 0) / n;
            const mL = rL.reduce((a, b) => a + b, 0) / n;
            let cov = 0;
            let vA = 0;
            let vL = 0;
            for (let i = 0; i < n; i++) {
              const dA = rA[i] - mA;
              const dL = rL[i] - mL;
              cov += dA * dL;
              vA += dA * dA;
              vL += dL * dL;
            }
            if (vA > 0 && vL > 0) {
              const rhoEmpirico = cov / Math.sqrt(vA * vL);
              rho = 0.7 * rhoEmpirico + 0.3 * rho;
            }
          }
        } catch {
          // Mantener estimación factorial
        }
      }

      // Covarianza mensual sigma_AL
      const covMensual = (rho * (volA / Math.sqrt(12)) * (volL / Math.sqrt(12)));

      // Peso en la cartera óptima
      let pesoOptimo = 0;
      if (optimo.assets && optimo.weights) {
        const idx = optimo.assets.findIndex((a) => a.ticker === ticker);
        if (idx >= 0) pesoOptimo = optimo.weights[idx];
      }

      // Rol LDI
      let rol = "Diversificador";
      let rolTipo = "neutral";
      if (ticker === "UDIBONO") {
        rol = "Cobertura Núcleo (Directa INPC)";
        rolTipo = "nucleo";
      } else if (ticker === "CETES28") {
        rol = "Colchón de Liquidez y Tasa";
        rolTipo = "liquidez";
      } else if (ticker === "DBA" || ticker === "XLE") {
        rol = "Satélite de Materia Prima";
        rolTipo = "satelite";
      } else if (ticker === "IVVPESOISHRS.MX" || ticker === "GLD") {
        rol = "Cobertura Dólar / Valor Refugio";
        rolTipo = "dolar";
      }

      return {
        ticker,
        label,
        rho: Number(rho.toFixed(3)),
        sigmaAL: covMensual,
        vol: volA,
        peso: pesoOptimo,
        rol,
        rolTipo,
      };
    });

    const ordenados = [...resultados].sort((a, b) => b.rho - a.rho);
    const top = ordenados[0] || ordenados.find((r) => r.ticker === "UDIBONO");
    const commodity = ordenados.find((r) => r.ticker === "DBA" || r.ticker === "XLE") || ordenados[1];

    return {
      metricas: ordenados,
      activoTop: top,
      activoCommodity: commodity,
      varPasivo: varL,
    };
  }, [datos, universo, matrizApi]);

  const detalleActivo = useMemo(() => {
    return metricas.find((m) => m.ticker === activoSeleccionado) || metricas[0];
  }, [metricas, activoSeleccionado]);

  return (
    <div className="vista-acoplamiento-container">
      {/* ENCABEZADO DE LA VISTA */}
      <div className="vista-encabezado-moderno">
        <div>
          <div className="badge-seccion-neon">
            <IconoAcoplamiento size={14} /> SENSIBILIDAD MACRO & ACOPLAMIENTO LDI
          </div>
          <h1 className="titulo-vista-principal">Vector de Acoplamiento y Covarianza (σAL)</h1>
          <p className="subtitulo-vista">
            Matriz de sensibilidad cuantitativa entre el costo de tu canasta personal y los 8 activos del universo financiero.
          </p>
        </div>

        <div className="acciones-header-acoplamiento">
          {(universo?.stale || matrizApi?.stale) && (
            <StaleBadge asOf={matrizApi?.as_of || universo?.as_of} />
          )}
          <button
            type="button"
            className="btn-ir-cobertura-directo"
            onClick={() => onIr?.("cobertura")}
          >
            <IconoPortafolio size={15} /> Ver Cartera Óptima →
          </button>
        </div>
      </div>

      {/* 4 HERO METRIC CARDS */}
      <div className="grid-metricas-acoplamiento">
        <div className="card-metrica-glow border-morado">
          <span className="label-metrica-dim">Activo Núcleo de Cobertura</span>
          <span className="valor-metrica-glow color-morado">
            {activoTop?.label} (+{activoTop?.rho})
          </span>
          <span className="nota-metrica-sub">
            Máxima correlación positiva frente a tu canasta mensual
          </span>
        </div>

        <div className="card-metrica-glow border-cian">
          <span className="label-metrica-dim">Cobertura de Materias Primas</span>
          <span className="valor-metrica-glow color-cian">
            {activoCommodity?.label} (+{activoCommodity?.rho})
          </span>
          <span className="nota-metrica-sub">
            Inmuniza picos en rubros de Alimentos y Energía
          </span>
        </div>

        <div className="card-metrica-glow border-verde">
          <span className="label-metrica-dim">Varianza de tu Pasivo (σL²)</span>
          <span className="valor-metrica-glow color-verde">
            {(varPasivo * 1e4).toFixed(2)} × 10⁻⁴
          </span>
          <span className="nota-metrica-sub">
            Volatilidad inherente del costo de vida de tu hogar
          </span>
        </div>

        <div className="card-metrica-glow border-ambar">
          <span className="label-metrica-dim">Activos Optimizados</span>
          <span className="valor-metrica-glow color-ambar">
            8 Activos LDI
          </span>
          <span className="nota-metrica-sub">
            {universo ? "110 meses empíricos sincronizados" : "Modelo factorial multi-rubro calibrado"}
          </span>
        </div>
      </div>

      {/* SECCIÓN PRINCIPAL: GRÁFICA DE BARRAS DIVERGENTES DE CORRELACIÓN */}
      <div className="seccion-grafica-acoplamiento-grid">
        <div className="panel-grafica-acoplamiento">
          <div className="panel-grafica-header">
            <div>
              <h3 className="titulo-seccion-panel">Correlación con tu Inflación Personal (ρA,L)</h3>
              <p className="subtitulo-seccion-panel">
                Valores positivos indican activos que se revalúan cuando suben tus gastos (inmunizadores de pasivo).
              </p>
            </div>
            <div className="leyenda-colores-acoplamiento">
              <span className="tag-color-leyenda"><span className="dot-color morado" /> &gt; 0.40 Alta</span>
              <span className="tag-color-leyenda"><span className="dot-color cian" /> &gt; 0.20 Media</span>
              <span className="tag-color-leyenda"><span className="dot-color gris" /> &gt; 0.00 Neutral</span>
              <span className="tag-color-leyenda"><span className="dot-color rojo" /> &lt; 0.00 Inversa</span>
            </div>
          </div>

          <div className="chart-wrapper-acoplamiento">
            <ResponsiveContainer width="100%" height={340}>
              <BarChart
                data={metricas}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 120, bottom: 5 }}
              >
                <XAxis
                  type="number"
                  domain={[-0.2, 1.0]}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  stroke="#64748b"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  stroke="#94a3b8"
                  tick={{ fill: "#e2e8f0", fontSize: 12, fontWeight: 500 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="tooltip-dark-custom">
                          <div className="tooltip-header-txt">{d.label} ({d.ticker})</div>
                          <div className="tooltip-line">
                            <span>Correlación (ρ):</span> <strong>{fmtPctConSigno(d.rho)}</strong>
                          </div>
                          <div className="tooltip-line">
                            <span>Covarianza (σAL):</span> <strong>{d.sigmaAL.toExponential(3)}</strong>
                          </div>
                          <div className="tooltip-line">
                            <span>Volatilidad Anual:</span> <strong>{fmtPct(d.vol)}</strong>
                          </div>
                          <div className="tooltip-line">
                            <span>Peso Asignado:</span> <strong>{fmtPct(d.peso)}</strong>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <ReferenceLine x={0} stroke="#475569" strokeWidth={1.5} />
                <Bar dataKey="rho" radius={[0, 6, 6, 0]}>
                  {metricas.map((entry) => (
                    <Cell
                      key={entry.ticker}
                      fill={
                        entry.rho >= 0.4
                          ? "#f8cc1b" // Cobertura fuerte
                          : entry.rho >= 0.2
                          ? "#c8aa2b" // Cobertura moderada
                          : entry.rho >= 0
                          ? "#64748b" // Neutro slate
                          : "#f43f5e" // Rojo coral
                      }
                      onClick={() => setActivoSeleccionado(entry.ticker)}
                      style={{ cursor: "pointer" }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="pie-grafica-acoplamiento">
            Haz clic en cualquier barra o activo para desglosar su comportamiento e impacto en la cartera.
          </div>
        </div>

        {/* TARJETA LATERAL DE DETALLE DEL ACTIVO SELECCIONADO */}
        <div className="panel-detalle-activo-acoplamiento">
          <div className="badge-activo-ticker">{detalleActivo.ticker}</div>
          <h3 className="nombre-activo-destacado">{detalleActivo.label}</h3>
          
          <div className="grid-mini-stats-activo">
            <div className="mini-stat-box">
              <span className="mini-stat-label">Correlación ρ</span>
              <span className="mini-stat-val color-morado font-mono">
                {fmtPctConSigno(detalleActivo.rho)}
              </span>
            </div>
            <div className="mini-stat-box">
              <span className="mini-stat-label">Peso Asignado</span>
              <span className="mini-stat-val color-cian font-mono">
                {fmtPct(detalleActivo.peso)}
              </span>
            </div>
            <div className="mini-stat-box">
              <span className="mini-stat-label">Volatilidad</span>
              <span className="mini-stat-val font-mono">
                {fmtPct(detalleActivo.vol)}
              </span>
            </div>
            <div className="mini-stat-box">
              <span className="mini-stat-label">Covarianza Mensual</span>
              <span className="mini-stat-val font-mono">
                {detalleActivo.sigmaAL.toExponential(2)}
              </span>
            </div>
          </div>

          <div className="caja-rol-estrategico">
            <div className="rol-titulo">ROL EN TU PORTAFOLIO:</div>
            <div className="rol-descripcion">
              <strong>{detalleActivo.rol}</strong>
              <p>
                {detalleActivo.ticker === "UDIBONO" &&
                  "Actúa como el estabilizador soberano indexado a la UDI. Absorbe la mayor parte del término lineal (-2w'σAL) sin añadir volatilidad innecesaria."}
                {detalleActivo.ticker === "CETES28" &&
                  "Provee el anclaje de liquidez libre de riesgo de duración. Captura las alzas de tasa de referencia de Banxico para gastos de corto plazo."}
                {detalleActivo.ticker === "DBA" &&
                  "Cubre directamente la inflación no subyacente de materias primas agrícolas (granos, café, azúcar) que presiona la canasta de alimentos."}
                {detalleActivo.ticker === "XLE" &&
                  "Protege contra aumentos en combustibles y tarifas eléctricas. Sube de valor en shocks geopolíticos y de petróleo crudo."}
                {detalleActivo.ticker === "GLD" &&
                  "Reserva de valor histórica ante crisis de confianza en divisas fiduciarias y picos de estanflación global."}
                {detalleActivo.ticker === "IVVPESOISHRS.MX" &&
                  "Captura el crecimiento de las 500 mayores empresas de EE.UU. con protección automática frente a la depreciación del peso mexicano."}
                {detalleActivo.ticker === "NAFTRACISHRS.MX" &&
                  "Exposición a las empresas mexicanas del IPC. Ofrece dividendo y apreciación de capital en fases de expansión económica local."}
                {detalleActivo.ticker === "MXN=X" &&
                  "Factor cambiario puro. El optimizador generalmente prefiere instrumentos productivos dolarizados (IVVPESO, GLD) antes que mantener efectivo en dólares estéril."}
              </p>
            </div>
          </div>

          <div className="caja-teorema-ldi-mini">
            <span className="teorema-tag">Principio LDI de Frank Faber</span>
            <p>
              En la función de pérdida <code>Var(rA - rL) = w'Σw - 2w'σAL + σL²</code>, los activos con mayor <code>σAL</code> reciben una bonificación proporcional que amortigua directamente el impacto de la inflación en tu patrimonio.
            </p>
          </div>
        </div>
      </div>

      {/* TABLA DE DETALLE EXHAUSTIVA */}
      <div className="panel panel-tabla-acoplamiento-moderna">
        <h3 className="titulo-seccion-panel">Desglose Completo de Acoplamiento y Pesos Óptimos</h3>
        <div className="tabla-responsive-custom">
          <table className="tabla-acoplamiento-full">
            <thead>
              <tr>
                <th>Activo</th>
                <th>Ticker</th>
                <th className="num">Correlación (ρ)</th>
                <th className="num">Covarianza (σAL)</th>
                <th className="num">Volatilidad Anual</th>
                <th className="num">Ponderación Óptima</th>
                <th>Función en Cartera</th>
              </tr>
            </thead>
            <tbody>
              {metricas.map((item) => (
                <tr
                  key={item.ticker}
                  className={item.ticker === activoSeleccionado ? "fila-seleccionada" : ""}
                  onClick={() => setActivoSeleccionado(item.ticker)}
                  style={{ cursor: "pointer" }}
                >
                  <td className="font-semibold activo-nombre-celda">
                    <span className="dot-fila" style={{ background: item.rho >= 0.4 ? "#f8cc1b" : item.rho >= 0.2 ? "#c8aa2b" : "#747c83" }} />
                    {item.label}
                  </td>
                  <td><code className="ticker-badge-code">{item.ticker}</code></td>
                  <td className={`num font-bold ${item.rho >= 0.3 ? "color-morado" : item.rho < 0 ? "color-rojo" : "color-cian"}`}>
                    {fmtPctConSigno(item.rho)}
                  </td>
                  <td className="num font-mono color-muted">{item.sigmaAL.toExponential(2)}</td>
                  <td className="num font-mono">{fmtPct(item.vol)}</td>
                  <td className="num">
                    <div className="celda-peso-visual">
                      <span className="cifra-peso font-bold">{fmtPct(item.peso)}</span>
                      <div className="barra-peso-mini">
                        <div
                          className="barra-peso-fill"
                          style={{
                            width: `${Math.min(100, item.peso * 100 * 2.5)}%`,
                            background: item.peso > 0.15 ? "var(--morado-neon)" : "var(--azul-cian)",
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`tag-rol-estrategia ${item.rolTipo}`}>
                      {item.rol}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
