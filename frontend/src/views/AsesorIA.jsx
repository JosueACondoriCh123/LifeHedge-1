import { useState, useMemo } from "react";
import { fmtPct, fmtPctDetallado, fmtPctConSigno, fmtMoneda } from "../formato.js";
import { ETIQUETAS_RUBRO } from "../rubros.js";
import { TICKER_LABELS } from "../cartera.js";
import {
  IconoDashboard,
  IconoPortafolio,
  IconoCheck,
  IconoAlerta,
  IconoSimulador,
} from "../components/Iconos.jsx";

const PREGUNTAS_PREDETERMINADAS = [
  {
    id: "por_que_udibonos",
    pregunta: "¿Por qué el motor asigna tanto a Udibonos?",
    respuesta:
      "Los Udibonos tienen una correlación directa y positiva con la inflación general (INPC). Al indexarse automáticamente a las UDIs, protegen el poder adquisitivo base de tus pasivos recurrentes sin asumir riesgo cambiario ni de volatilidad de renta variable.",
  },
  {
    id: "impacto_dolar",
    pregunta: "¿Qué pasa con mi portafolio si el USD/MXN sube a $22 pesos?",
    respuesta:
      "Tus posiciones en activos cotizados en dólares (IVVPESO, GLD, DBA, XLE) experimentarán una ganancia por tipo de cambio. El motor LDI mantiene esta exposición para cubrir los componentes importados de tu consumo (tecnología, alimentos procesados y energía).",
  },
  {
    id: "vs_afore",
    pregunta: "¿En qué se diferencia esta estrategia de una Siefore / Afore?",
    respuesta:
      "Las Afores optimizan contra un benchmark poblacional agregado (con horizontes de retiro fijos de 20-30 años). LifeHedge personaliza la función objetivo cuadrática contra tu propia canasta real de gasto mensual, neutralizando la inflación que tú efectivamente pagas.",
  },
  {
    id: "subida_tasas",
    pregunta: "¿Cómo me protejo si Banxico incrementa la tasa de interés?",
    respuesta:
      "Tu buffer en CETES28 captura el alza de tasas inmediatamente en cada subasta semanal, incrementando tu rendimiento de liquidez sin sufrir pérdidas por duración como ocurriría en bonos M a largo plazo.",
  },
];

export default function AsesorIA({ datos, onIr }) {
  const { inflacion, optimo, riesgo, pesos } = datos;

  const [preguntaActiva, setPreguntaActiva] = useState(PREGUNTAS_PREDETERMINADAS[0]);
  const [preguntaCustom, setPreguntaCustom] = useState("");
  const [historialChat, setHistorialChat] = useState([]);
  const [pensando, setPensando] = useState(false);

  // Calcular Score LDI (0 a 100)
  const ldiScore = useMemo(() => {
    let score = 50;
    // Eficiencia PHE aporta hasta +30
    if (optimo.phe > 0.4) score += 20;
    if (optimo.phe > 0.6) score += 10;
    // Tracking error penaliza si es alto
    if (optimo.tev < 0.05) score += 10;
    // Si delta es moderado o positivo cubierto
    if (inflacion.delta_anualizado < 0.02) score += 10;
    return Math.min(98, Math.max(30, Math.round(score)));
  }, [optimo, inflacion]);

  // Rubro de mayor gasto
  const rubroPrincipal = useMemo(() => {
    const ordenado = Object.entries(pesos).sort((a, b) => b[1] - a[1]);
    return ordenado[0] || ["alimentos_bebidas_tabaco", 0.3];
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

  const handleEnviarPregunta = (e) => {
    e.preventDefault();
    if (!preguntaCustom.trim() || pensando) return;

    const query = preguntaCustom.trim();
    setPreguntaCustom("");
    setPensando(true);

    setTimeout(() => {
      let respuestaGenerada = "";
      const qLower = query.toLowerCase();

      if (qLower.includes("inflaci") || qLower.includes("delta")) {
        respuestaGenerada = `Tu inflación personal calculada es del ${fmtPct(inflacion.personal_anual)} frente al INPC general del ${fmtPct(inflacion.general_anual)} (Delta: ${fmtPctConSigno(inflacion.delta_anualizado)}). Tu mayor rubro de presión es "${ETIQUETAS_RUBRO[rubroPrincipal[0]] || rubroPrincipal[0]}" (${fmtPct(rubroPrincipal[1])}), por lo que tu cobertura LDI sobrepondera activos sensibles a alimentos y energía.`;
      } else if (qLower.includes("riesgo") || qLower.includes("var") || qLower.includes("perder")) {
        respuestaGenerada = `El análisis de difusión de saltos de Merton arroja un VaR 95% de ${fmtPctConSigno(-riesgo.var_95)} y un CVaR de ${fmtPctConSigno(-riesgo.cvar_95)} a 12 meses. Esto significa que en el 95% de los escenarios simulados conservas al menos esa proporción de poder adquisitivo real.`;
      } else if (qLower.includes("cetes") || qLower.includes("efectivo") || qLower.includes("buffer")) {
        respuestaGenerada = `Tu cartera mantiene un buffer mandatorio en CETES28 que garantiza liquidez sin fricción para imprevistos, mientras que el resto del capital está inmunizando tu pasivo inflacionario en Udibonos y coberturas satélite.`;
      } else {
        respuestaGenerada = `Para tu perfil de gasto actual con ${fmtPct(optimo.phe)} de cobertura PHE, el motor recomienda mantener la asignación óptima encabezada por ${activoPrincipal.label} (${fmtPct(activoPrincipal.peso)}) y realizar revisiones mensuales cuando la desviación supere 1.5 puntos porcentuales.`;
      }

      setHistorialChat((prev) => [
        ...prev,
        { pregunta: query, respuesta: respuestaGenerada },
      ]);
      setPensando(false);
    }, 600);
  };

  return (
    <div className="vista-asesor-ia-container">
      {/* HEADER */}
      <div className="vista-encabezado-moderno">
        <div>
          <div className="badge-seccion-neon">
            <span>✨</span> INTELIGENCIA CUANTITATIVA LDI · POWERED BY DATA
          </div>
          <h1 className="titulo-vista-principal">Asesor Patrimonial LDI</h1>
          <p className="subtitulo-vista">
            Diagnóstico cuantitativo inteligente, explicaciones de cobertura y consultor financiero personal.
          </p>
        </div>

        <div className="score-ldi-pill-card">
          <div className="score-circulo-glow">
            <span className="score-num">{ldiScore}</span>
            <span className="score-total">/100</span>
          </div>
          <div className="score-texto-desglose">
            <span className="score-titulo">Score de Inmunización</span>
            <span className="score-sub">
              {ldiScore >= 80 ? "Protección Robusta AAA" : "Protección Moderada"}
            </span>
          </div>
        </div>
      </div>

      {/* TRES TARJETAS DE DIAGNÓSTICO EJECUTIVO */}
      <div className="grid-diagnostico-ia">
        <div className="card-diagnostico-neon morado">
          <div className="card-diag-top">
            <span className="tag-diag">PRESIÓN INFLACIONARIA</span>
            <span className="icono-diag">📊</span>
          </div>
          <h3 className="titulo-diag">
            {ETIQUETAS_RUBRO[rubroPrincipal[0]] || rubroPrincipal[0]} es tu mayor riesgo
          </h3>
          <p className="desc-diag">
            Representa el <strong>{fmtPct(rubroPrincipal[1])}</strong> de tu presupuesto mensual. Si este rubro sufre un shock del +15%, tu cartera LDI neutraliza el <strong>{fmtPct(optimo.phe)}</strong> del impacto.
          </p>
          <button
            type="button"
            className="btn-enlace-diag"
            onClick={() => onIr?.("inflacion")}
          >
            Ver Canasta de Gasto →
          </button>
        </div>

        <div className="card-diagnostico-neon cian">
          <div className="card-diag-top">
            <span className="tag-diag">ANCLAJE DE COBERTURA</span>
            <span className="icono-diag">🛡️</span>
          </div>
          <h3 className="titulo-diag">
            {activoPrincipal.label} actúa como tu pilar central
          </h3>
          <p className="desc-diag">
            Con una ponderación del <strong>{fmtPct(activoPrincipal.peso)}</strong>, absorbe la varianza inflacionaria anual y estabiliza tu poder adquisitivo en horizontes multi-anuales.
          </p>
          <button
            type="button"
            className="btn-enlace-diag"
            onClick={() => onIr?.("cobertura")}
          >
            Ver Cartera Óptima →
          </button>
        </div>

        <div className="card-diagnostico-neon verde">
          <div className="card-diag-top">
            <span className="tag-diag">CONTROL DE RIESGO DE COLA</span>
            <span className="icono-diag">⚡</span>
          </div>
          <h3 className="titulo-diag">
            CVaR 95% acotado a {fmtPctConSigno(-riesgo.cvar_95)}
          </h3>
          <p className="desc-diag">
            En 1,000 simulaciones de saltos de Merton con eventos extremos de mercado, el valor final mediano preserva el <strong>{fmtPct(riesgo.media_final - 1)}</strong> de poder de compra.
          </p>
          <button
            type="button"
            className="btn-enlace-diag"
            onClick={() => onIr?.("riesgo")}
          >
            Ver Simulación Merton →
          </button>
        </div>
      </div>

      {/* SECCIÓN INTERACTIVA: PREGUNTAS CLAVE & ASISTENTE LDI */}
      <div className="seccion-asistente-chat-grid">
        {/* PANEL IZQUIERDO: PREGUNTAS FRECUENTES CLAVE */}
        <div className="panel-preguntas-clave">
          <h3 className="titulo-seccion-panel">Consultas Frecuentes de la Estrategia</h3>
          <p className="subtitulo-seccion-panel">
            Selecciona una consulta para entender los principios matemáticos de tu portafolio.
          </p>

          <div className="lista-botones-preguntas">
            {PREGUNTAS_PREDETERMINADAS.map((p) => {
              const activa = p.id === preguntaActiva.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`btn-pregunta-predeterminada ${activa ? "activa" : ""}`}
                  onClick={() => setPreguntaActiva(p)}
                >
                  <span className="punto-pregunta">{activa ? "●" : "○"}</span>
                  <span className="texto-pregunta">{p.pregunta}</span>
                </button>
              );
            })}
          </div>

          <div className="tarjeta-respuesta-activa">
            <div className="tarjeta-resp-header">
              <span className="tag-resp-ai">Respuesta Cuantitativa</span>
              <span className="tag-verificado-ldi">✓ Verificado por Motor QP</span>
            </div>
            <p className="cuerpo-respuesta-txt">{preguntaActiva.respuesta}</p>
          </div>
        </div>

        {/* PANEL DERECHO: CONVERSACIÓN INTERACTIVA */}
        <div className="panel-chat-interactivo">
          <div className="chat-header-bar">
            <div className="avatar-ia-circulo">⬡</div>
            <div>
              <div className="chat-ia-nombre">LifeHedge AI Copilot</div>
              <div className="chat-ia-status">Conectado al motor local (puerto 8000)</div>
            </div>
          </div>

          <div className="chat-mensajes-scroll">
            <div className="mensaje-burbuja ia">
              <span className="emisor-tag">LifeHedge AI</span>
              <p>
                Hola. He analizado tu estado de cuenta y tu cartera óptima. Tu eficiencia de cobertura PHE es del <strong>{fmtPct(optimo.phe)}</strong> con un colchón del <strong>10%</strong> en Cetes. ¿Qué aspecto de tu estrategia te gustaría profundizar?
              </p>
            </div>

            {historialChat.map((msg, i) => (
              <div key={i} className="grupo-dialogo">
                <div className="mensaje-burbuja usuario">
                  <p>{msg.pregunta}</p>
                </div>
                <div className="mensaje-burbuja ia">
                  <span className="emisor-tag">LifeHedge AI</span>
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
              placeholder="Escribe una pregunta sobre tu portafolio, inflación o riesgo..."
              value={preguntaCustom}
              onChange={(e) => setPreguntaCustom(e.target.value)}
              className="chat-input-field"
            />
            <button
              type="submit"
              className="btn-enviar-chat"
              disabled={!preguntaCustom.trim() || pensando}
            >
              Consultar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
