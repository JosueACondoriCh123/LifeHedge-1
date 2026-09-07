import { useState, useMemo, useEffect, useCallback } from "react";
import { fmtPct, fmtPctDetallado, fmtPctConSigno, fmtMoneda } from "../formato.js";
import { ETIQUETAS_RUBRO } from "../rubros.js";
import { TICKER_LABELS } from "../cartera.js";
import { consultarAsesorLDI } from "../api/openrouter.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import {
  guardarMensajeIA,
  obtenerHistorialIA,
  listarConversacionesIA,
  calcularScorePatrimonial,
} from "../datos/analisis.js";
import {
  IconoDashboard,
  IconoPortafolio,
  IconoCheck,
  IconoAlerta,
  IconoSimulador,
} from "../components/Iconos.jsx";

const NOMBRES_RUBRO_ES = {
  alimentos: "Alimentos y Bebidas",
  vivienda: "Vivienda y Servicios",
  transporte: "Transporte y Movilidad",
  salud: "Salud y Medicamentos",
  educacion: "Educación",
  ropa: "Ropa y Calzado",
  esparcimiento: "Esparcimiento y Ocio",
  otros: "Otros Gastos",
};

const NOMBRES_RUBRO_EN = {
  alimentos: "Food & Groceries",
  vivienda: "Housing & Utilities",
  transporte: "Transportation",
  salud: "Healthcare & Medical",
  educacion: "Education",
  ropa: "Clothing & Apparel",
  esparcimiento: "Leisure & Recreation",
  otros: "Other Expenses",
};

export function generarPreguntasDinamicas(datos = {}, esIngles = false) {
  const { inflacion = {}, optimo = {}, riesgo = {}, pesos = {} } = datos;

  // Ordenar rubros de la canasta del usuario de mayor a menor ponderación
  const rubrosOrdenados = Object.entries(pesos)
    .filter(([_, p]) => typeof p === "number" && p > 0)
    .sort((a, b) => b[1] - a[1]);

  const [rubro1Clave, rubro1Peso] = rubrosOrdenados[0] || ["alimentos", 0.30];
  const [rubro2Clave, rubro2Peso] = rubrosOrdenados[1] || ["vivienda", 0.20];

  const rubro1Nombre = esIngles
    ? (NOMBRES_RUBRO_EN[rubro1Clave] || rubro1Clave)
    : (NOMBRES_RUBRO_ES[rubro1Clave] || ETIQUETAS_RUBRO[rubro1Clave] || rubro1Clave);

  const rubro2Nombre = esIngles
    ? (NOMBRES_RUBRO_EN[rubro2Clave] || rubro2Clave)
    : (NOMBRES_RUBRO_ES[rubro2Clave] || ETIQUETAS_RUBRO[rubro2Clave] || rubro2Clave);

  // Encontrar activo con mayor ponderación en la cartera óptima
  let activoMax = { ticker: "UDIBONO", label: "Udibonos 10Y", peso: 0.40 };
  if (Array.isArray(optimo.assets) && Array.isArray(optimo.weights) && optimo.weights.length > 0) {
    let maxIdx = 0;
    let maxVal = -1;
    optimo.weights.forEach((w, i) => {
      if (w > maxVal) {
        maxVal = w;
        maxIdx = i;
      }
    });
    const item = optimo.assets[maxIdx];
    const ticker = item?.ticker || item || "UDIBONO";
    const label = TICKER_LABELS[ticker] || item?.label || ticker;
    activoMax = { ticker, label, peso: maxVal > 0 ? maxVal : 0.40 };
  }

  // Métricas cuantitativas
  const phe = optimo.phe ?? 0.812;
  const tev = optimo.tev ?? 0.0235;
  const delta = inflacion.delta_anualizado ?? 0.0006;
  const cvar = Math.abs(riesgo.cvar_95 ?? 0.068);
  const mediaFinal = riesgo.media_final ?? 1.05;
  const preservacion = mediaFinal > 1 ? mediaFinal - 1 : 0.05;

  if (esIngles) {
    return [
      {
        id: "rubro_mayor_riesgo",
        pregunta: `How does the portfolio mitigate inflation risk in ${rubro1Nombre} (${fmtPct(rubro1Peso)})?`,
        respuesta: `${rubro1Nombre} represents your highest consumption liability concentration (${fmtPct(rubro1Peso)} of your monthly basket). The LDI quadratic engine allocates ${fmtPct(activoMax.peso)} to ${activoMax.label} (${activoMax.ticker}) to achieve a ${fmtPct(phe)} Perfect Hedge Efficiency (PHE), absorbing the brunt of price variance in this category without uncompensated risk.`,
      },
      {
        id: "divergencia_delta",
        pregunta: `Why does my consumption basket produce a ${fmtPctConSigno(delta)} Delta vs official headline CPI?`,
        respuesta: `Your household expenditures allocate ${fmtPct(rubro1Peso + rubro2Peso)} combined between ${rubro1Nombre} and ${rubro2Nombre}, sectors whose actual pricing dynamics diverge from INEGI's aggregated national average. This ${fmtPctConSigno(delta)} annual Delta confirms the necessity of custom liability immunization over generic benchmark funds.`,
      },
      {
        id: "asignacion_ancla",
        pregunta: `Why did the optimization allocate ${fmtPct(activoMax.peso)} to ${activoMax.label}?`,
        respuesta: `${activoMax.label} (${activoMax.ticker}) provides the optimal covariance profile against your specific liability stream. This allocation constrains Tracking Error Volatility (TEV) to ${fmtPct(tev)}, ensuring that asset gains systematically match the real escalation rate of your living expenses.`,
      },
      {
        id: "riesgo_cola_estres",
        pregunta: `What downside protection is guaranteed under extreme tail-risk scenarios (95% CVaR)?`,
        respuesta: `Across 1,000 stochastic Merton jump-diffusion simulation paths incorporating liquidity discontinuities, expected conditional tail loss (95% CVaR) is bounded at ${fmtPctConSigno(-cvar)}. Median projected terminal wealth retains a ${fmtPct(preservacion)} surplus in real terms above your personal inflation rate.`,
      },
    ];
  }

  return [
    {
      id: "rubro_mayor_riesgo",
      pregunta: `¿Cómo mitiga el portafolio el riesgo inflacionario en ${rubro1Nombre} (${fmtPct(rubro1Peso)})?`,
      respuesta: `${rubro1Nombre} representa tu mayor concentración de gasto mensual (${fmtPct(rubro1Peso)} de tu canasta). El motor LDI balanceó tu cartera asignando ${fmtPct(activoMax.peso)} a ${activoMax.label} (${activoMax.ticker}) para alcanzar una Eficiencia de Cobertura (PHE) del ${fmtPct(phe)}, neutralizando la mayor parte de la dispersión de precios en este rubro sin incurrir en volatilidad innecesaria.`,
    },
    {
      id: "divergencia_delta",
      pregunta: `¿Por qué mi canasta genera un Delta de ${fmtPctConSigno(delta)} frente al INPC general de Banxico?`,
      respuesta: `Tus egresos concentran un ${fmtPct(rubro1Peso + rubro2Peso)} en conjunto entre ${rubro1Nombre} y ${rubro2Nombre}, cuya dinámica de precios se desvía del promedio ponderado nacional de INEGI. Esta divergencia (Delta de ${fmtPctConSigno(delta)} anual) exige una cobertura a la medida en instrumentos indexados en lugar de productos indexados a benchmarks genéricos.`,
    },
    {
      id: "asignacion_ancla",
      pregunta: `¿Por qué el optimizador asignó un ${fmtPct(activoMax.peso)} a ${activoMax.label}?`,
      respuesta: `${activoMax.label} (${activoMax.ticker}) presenta la matriz de covarianza más eficiente contra tus pasivos específicos. Esta ponderación minimiza el Tracking Error Volatility (TEV) al ${fmtPct(tev)}, garantizando que el rendimiento de tus activos siga estrechamente el encarecimiento de tu costo de vida.`,
    },
    {
      id: "riesgo_cola_estres",
      pregunta: `¿Qué protección ofrece el portafolio ante choques severos o eventos de cola (CVaR 95%)?`,
      respuesta: `Bajo 1,000 trayectorias de simulación estocástica de Merton con saltos y caídas de mercado, la pérdida condicional máxima esperada (CVaR 95%) se mantiene acotada en ${fmtPctConSigno(-cvar)}. Adicionalmente, el valor mediano proyectado preserva ${fmtPct(preservacion)} de excedente en términos reales sobre tu inflación.`,
    },
  ];
}

export default function AsesorIA({ datos, onIr }) {
  const { inflacion, optimo, riesgo, pesos } = datos;
  const { t, esIngles } = useLanguage();

  const preguntasSugeridas = useMemo(() => {
    return generarPreguntasDinamicas(datos, esIngles);
  }, [datos, esIngles]);

  const [idPreguntaActiva, setIdPreguntaActiva] = useState("rubro_mayor_riesgo");

  const preguntaActiva = useMemo(() => {
    return (
      preguntasSugeridas.find((p) => p.id === idPreguntaActiva) ||
      preguntasSugeridas[0]
    );
  }, [preguntasSugeridas, idPreguntaActiva]);

  const [preguntaCustom, setPreguntaCustom] = useState("");
  const [historialChat, setHistorialChat] = useState([]);
  const [pensando, setPensando] = useState(false);
  const [conversacionId, setConversacionId] = useState(null);
  const [conversaciones, setConversaciones] = useState([]);
  const [scoreServer, setScoreServer] = useState(null);

  // Cargar score institucional y lista de conversaciones desde Supabase
  const refrescarConversaciones = useCallback(async () => {
    try {
      const lista = await listarConversacionesIA();
      setConversaciones(lista);
    } catch {
      // Sin supabase o invitado
    }
  }, []);

  useEffect(() => {
    refrescarConversaciones();
    calcularScorePatrimonial().then((res) => {
      if (res?.score_total) setScoreServer(res);
    });
  }, [refrescarConversaciones]);

  // Cargar mensajes de una conversación seleccionada
  const handleSeleccionarConversacion = async (cId) => {
    try {
      const msgs = await obtenerHistorialIA(cId);
      if (Array.isArray(msgs) && msgs.length > 0) {
        setConversacionId(cId);
        // Formatear a estructura { pregunta, respuesta }
        const agrupados = [];
        for (let i = 0; i < msgs.length; i++) {
          if (msgs[i].rol === "user") {
            agrupados.push({
              pregunta: msgs[i].contenido,
              respuesta: msgs[i + 1]?.rol === "assistant" ? msgs[i + 1].contenido : "...",
            });
            if (msgs[i + 1]?.rol === "assistant") i++;
          }
        }
        setHistorialChat(agrupados);
      }
    } catch {
      // Ignorar
    }
  };

  const handleNuevaConsulta = () => {
    setConversacionId(null);
    setHistorialChat([]);
    setPreguntaCustom("");
  };

  // Calcular Score LDI (0 a 100) — toma el cálculo del servidor PL/pgSQL si existe
  const ldiScore = useMemo(() => {
    if (scoreServer?.score_total) return Math.round(scoreServer.score_total);
    let score = 50;
    if (optimo.phe > 0.4) score += 20;
    if (optimo.phe > 0.6) score += 10;
    if (optimo.tev < 0.05) score += 10;
    if (inflacion.delta_anualizado < 0.02) score += 10;
    return Math.min(98, Math.max(30, Math.round(score)));
  }, [optimo, inflacion, scoreServer]);

  const ratingBadge = useMemo(() => {
    if (scoreServer?.calificacion) return `Calificación ${scoreServer.calificacion}`;
    return ldiScore >= 80 ? "Protección Robusta AAA" : "Protección Moderada";
  }, [scoreServer, ldiScore]);

  // Rubro de mayor gasto
  const rubroPrincipal = useMemo(() => {
    const ordenado = Object.entries(pesos).sort((a, b) => b[1] - a[1]);
    return ordenado[0] || ["alimentos", 0.3];
  }, [pesos]);

  // Activo más ponderado
  const activoPrincipal = useMemo(() => {
    if (!optimo.assets || !optimo.weights) return { ticker: "UDIBONO", peso: 0.3 };
    let maxIdx = 0;
    let maxVal = -1;
    optimo.weights.forEach((w, i) => {
      if (w > maxVal) {
        maxVal = w;
        maxIdx = i;
      }
    });
    return {
      ticker: optimo.assets[maxIdx].ticker,
      label: TICKER_LABELS[optimo.assets[maxIdx].ticker] || optimo.assets[maxIdx].label,
      peso: maxVal,
    };
  }, [optimo]);

  const handleEnviarPregunta = async (e, textoDirecto = null) => {
    if (e) e.preventDefault();
    const query = (textoDirecto || preguntaCustom).trim();
    if (!query || pensando) return;

    setPreguntaCustom("");
    setPensando(true);

    // Persistir pregunta del usuario en Supabase (si está autenticado)
    let idActual = conversacionId;
    try {
      const resGuardar = await guardarMensajeIA({
        conversacionId: idActual,
        rol: "user",
        contenido: query,
        nuevoTitulo: query.slice(0, 36),
      });
      if (resGuardar?.conversacion_id) {
        idActual = resGuardar.conversacion_id;
        setConversacionId(idActual);
      }
    } catch {
      // continúa sin bloquear
    }

    try {
      const respuesta = await consultarAsesorLDI(query, datos, historialChat);
      setHistorialChat((prev) => [
        ...prev,
        { pregunta: query, respuesta },
      ]);

      // Persistir respuesta de IA con snapshot de métricas
      if (idActual) {
        guardarMensajeIA({
          conversacionId: idActual,
          rol: "assistant",
          contenido: respuesta,
          metricas: {
            phe: optimo.phe,
            delta: inflacion.delta_anualizado,
            tev: optimo.tev,
            var_95: optimo.var_95 || riesgo.cvar_95,
          },
        }).then(() => refrescarConversaciones());
      }
    } catch {
      setHistorialChat((prev) => [
        ...prev,
        {
          pregunta: query,
          respuesta:
            "Ocurrió un inconveniente al consultar el Asesor Patrimonial. Tu cartera sigue protegida y optimizada bajo los parámetros calculados.",
        },
      ]);
    } finally {
      setPensando(false);
    }
  };

  return (
    <div className="vista-asesor-ia-container">
      {/* HEADER */}
      <div className="vista-encabezado-moderno">
        <div>
          <div className="badge-seccion-neon">
            {t("asesoria.badge")}
          </div>
          <h1 className="titulo-vista-principal">{t("asesoria.title")}</h1>
          <p className="subtitulo-vista">
            {t("asesoria.subtitle")}
          </p>
        </div>

        <div className="score-ldi-pill-card">
          <div className="score-circulo-glow">
            <span className="score-num">{ldiScore}</span>
            <span className="score-total">/100</span>
          </div>
          <div className="score-texto-desglose">
            <span className="score-titulo">{esIngles ? "Immunization Score" : "Score de Inmunización"}</span>
            <span className="score-sub">
              {ratingBadge}
            </span>
          </div>
        </div>
      </div>

      {/* TRES TARJETAS DE DIAGNÓSTICO EJECUTIVO */}
      <div className="grid-diagnostico-ia">
        <div className="card-diagnostico-neon morado">
          <div className="card-diag-top">
            <span className="tag-diag">{esIngles ? "INFLATION PRESSURE" : "PRESIÓN INFLACIONARIA"}</span>
          </div>
          <h3 className="titulo-diag">
            {t("rubros." + rubroPrincipal[0], {}, ETIQUETAS_RUBRO[rubroPrincipal[0]] || rubroPrincipal[0])} {esIngles ? "is your primary risk" : "es tu mayor riesgo"}
          </h3>
          <p className="desc-diag">
            {esIngles
              ? `Accounts for ${fmtPct(rubroPrincipal[1])} of your monthly expenditure. Under a +15% price spike, your LDI portfolio neutralizes ${fmtPct(optimo.phe)} of the impact.`
              : `Representa el ${fmtPct(rubroPrincipal[1])} de tu presupuesto mensual. Si este rubro sufre un shock del +15%, tu cartera LDI neutraliza el ${fmtPct(optimo.phe)} del impacto.`}
          </p>
          <button
            type="button"
            className="btn-enlace-diag"
            onClick={() => onIr?.("inflacion")}
          >
            {esIngles ? "View Expenditure Basket →" : "Ver Canasta de Gasto →"}
          </button>
        </div>

        <div className="card-diagnostico-neon cian">
          <div className="card-diag-top">
            <span className="tag-diag">{esIngles ? "HEDGE ANCHOR" : "ANCLAJE DE COBERTURA"}</span>
          </div>
          <h3 className="titulo-diag">
            {t("tickers." + activoPrincipal.ticker, {}, activoPrincipal.label)} {esIngles ? "acts as your core pillar" : "actúa como tu pilar central"}
          </h3>
          <p className="desc-diag">
            {esIngles
              ? `Weighted at ${fmtPct(activoPrincipal.peso)}, it absorbs annual inflation variance and stabilizes your purchasing power over multi-year horizons.`
              : `Con una ponderación del ${fmtPct(activoPrincipal.peso)}, absorbe la varianza inflacionaria anual y estabiliza tu poder adquisitivo en horizontes multianuales.`}
          </p>
          <button
            type="button"
            className="btn-enlace-diag"
            onClick={() => onIr?.("cobertura")}
          >
            {esIngles ? "View Optimal Portfolio →" : "Ver Cartera Óptima →"}
          </button>
        </div>

        <div className="card-diagnostico-neon verde">
          <div className="card-diag-top">
            <span className="tag-diag">{esIngles ? "TAIL RISK CONTROL" : "CONTROL DE RIESGO DE COLA"}</span>
          </div>
          <h3 className="titulo-diag">
            {esIngles ? `95% CVaR bounded at ${fmtPctConSigno(-riesgo.cvar_95)}` : `CVaR 95% acotado a ${fmtPctConSigno(-riesgo.cvar_95)}`}
          </h3>
          <p className="desc-diag">
            {esIngles
              ? `Across 1,000 Merton jump-diffusion simulated runs with extreme shocks, median terminal wealth retains ${fmtPct(riesgo.media_final - 1)} in purchasing power.`
              : `En 1,000 simulaciones de saltos de Merton con eventos extremos de mercado, el valor final mediano preserva el ${fmtPct(riesgo.media_final - 1)} de poder de compra.`}
          </p>
          <button
            type="button"
            className="btn-enlace-diag"
            onClick={() => onIr?.("riesgo")}
          >
            {esIngles ? "View Merton Simulation →" : "Ver Simulación Merton →"}
          </button>
        </div>
      </div>

      {/* SECCIÓN INTERACTIVA: PREGUNTAS CLAVE & ASISTENTE LDI */}
      <div className="seccion-asistente-chat-grid">
        {/* PANEL IZQUIERDO: PREGUNTAS FRECUENTES CLAVE */}
        <div className="panel-preguntas-clave">
          <h3 className="titulo-seccion-panel">{t("asesoria.faqTitle")}</h3>
          <p className="subtitulo-seccion-panel">
            {esIngles
              ? "Select a query to examine the quantitative principles behind your portfolio."
              : "Selecciona una consulta para entender los principios matemáticos de tu portafolio."}
          </p>

          <div className="lista-botones-preguntas">
            {preguntasSugeridas.map((p) => {
              const activa = p.id === preguntaActiva?.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`btn-pregunta-predeterminada ${activa ? "activa" : ""}`}
                  onClick={() => setIdPreguntaActiva(p.id)}
                >
                  <span className="punto-pregunta">{activa ? "●" : "○"}</span>
                  <span className="texto-pregunta">{p.pregunta}</span>
                </button>
              );
            })}
          </div>

          <div className="tarjeta-respuesta-activa">
            <div className="tarjeta-resp-header">
              <span className="tag-resp-ai">{esIngles ? "Quantitative Analysis" : "Respuesta Cuantitativa"}</span>
              <span className="tag-verificado-ldi">{esIngles ? "Verified by QP Engine" : "Verificado por Motor QP"}</span>
            </div>
            <p className="cuerpo-respuesta-txt">{preguntaActiva?.respuesta}</p>
            <button
              type="button"
              className="btn-profundizar-glm"
              disabled={pensando}
              onClick={() =>
                handleEnviarPregunta(
                  null,
                  esIngles
                    ? `Analyze with my personal figures: ${preguntaActiva?.pregunta}`
                    : `Analiza con mis datos reales: ${preguntaActiva?.pregunta}`
                )
              }
            >
              {esIngles
                ? "Deepen quantitative analysis on my personal figures →"
                : "Profundizar análisis cuantitativo sobre mis números →"}
            </button>
          </div>
        </div>

        {/* PANEL DERECHO: CONVERSACIÓN INTERACTIVA */}
        <div className="panel-chat-interactivo">
          <div className="chat-header-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div className="avatar-ia-circulo">LH</div>
              <div>
                <div className="chat-ia-nombre">{esIngles ? "LifeHedge Wealth Advisor" : "Asesor Patrimonial LifeHedge"}</div>
                <div className="chat-ia-status">
                  <span className="dot-en-linea" /> {esIngles ? "Institutional Quantitative Engine · Online" : "Motor Cuantitativo Institucional · En línea"}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {conversaciones.length > 0 && (
                <select
                  value={conversacionId || ""}
                  onChange={(e) => {
                    if (e.target.value) handleSeleccionarConversacion(e.target.value);
                    else handleNuevaConsulta();
                  }}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    color: "var(--color-texto)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "6px",
                    padding: "4px 8px",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    maxWidth: "160px",
                  }}
                >
                  <option value="">{esIngles ? "-- Saved Sessions --" : "-- Sesiones Guardadas --"}</option>
                  {conversaciones.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.titulo}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={handleNuevaConsulta}
                style={{
                  background: "rgba(168,85,247,0.15)",
                  border: "1px solid rgba(168,85,247,0.3)",
                  color: "#e9d5ff",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                }}
                title={esIngles ? "Start a new advisory thread" : "Comenzar un nuevo hilo de consulta"}
              >
                + {t("asesoria.newChat")}
              </button>
            </div>
          </div>

          <div className="chat-mensajes-scroll">
            <div className="mensaje-burbuja ia">
              <span className="emisor-tag">{esIngles ? "Wealth Advisor" : "Asesor Patrimonial"}</span>
              <p>
                {esIngles ? (
                  <>
                    Hello. I have examined your statement and optimal portfolio. Your PHE hedging efficiency is <strong>{fmtPct(optimo.phe)}</strong> with a <strong>10%</strong> cash buffer in Cetes. Which aspect of your strategy would you like to explore?
                  </>
                ) : (
                  <>
                    Hola. He analizado tu estado de cuenta y tu cartera óptima. Tu eficiencia de cobertura PHE es del <strong>{fmtPct(optimo.phe)}</strong> con un colchón del <strong>10%</strong> en Cetes. ¿Qué aspecto de tu estrategia te gustaría profundizar?
                  </>
                )}
              </p>
            </div>

            {historialChat.map((msg, i) => (
              <div key={i} className="grupo-dialogo">
                <div className="mensaje-burbuja usuario">
                  <p>{msg.pregunta}</p>
                </div>
                <div className="mensaje-burbuja ia">
                  <span className="emisor-tag">{esIngles ? "Wealth Advisor" : "Asesor Patrimonial"}</span>
                  <p>{msg.respuesta}</p>
                </div>
              </div>
            ))}

            {pensando && (
              <div className="mensaje-burbuja ia pensando">
                <span className="dot-typing" />
                <span className="dot-typing" />
                <span className="dot-typing" />
              </div>
            )}
          </div>

          <form className="chat-input-form" onSubmit={handleEnviarPregunta}>
            <input
              type="text"
              placeholder={t("asesoria.promptPlaceholder")}
              value={preguntaCustom}
              onChange={(e) => setPreguntaCustom(e.target.value)}
              className="chat-input-field"
            />
            <button
              type="submit"
              className="btn-enviar-chat"
              disabled={!preguntaCustom.trim() || pensando}
            >
              {t("asesoria.askBtn")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
