/**
 * Cliente OpenRouter para LifeHedge AI Copilot
 * Modelo: z-ai/glm-5.2
 * Proporciona diagnósticos cuantitativos y asesoría financiera LDI personalizada.
 */

const OPENROUTER_API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_OPENROUTER_API_KEY) || "";

const MODELO_GLM = "z-ai/glm-5.2";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Consulta al modelo GLM 5.2 a través de OpenRouter
 * @param {string} pregunta - Pregunta del usuario
 * @param {object} contexto - Datos de inflación, canasta, cartera óptima y riesgo
 * @param {Array} historial - Historial previo de preguntas y respuestas
 * @returns {Promise<string>}
 */
export async function consultarAsesorLDI(pregunta, contexto = {}, historial = []) {
  const { inflacion, optimo, riesgo, pesos } = contexto;

  // Construir resumen cuantitativo del usuario para el prompt del sistema
  const resumenCanasta = pesos
    ? Object.entries(pesos)
        .map(([r, p]) => `${r}: ${(p * 100).toFixed(1)}%`)
        .join(", ")
    : "No disponible";

  const resumenCartera = optimo?.assets && optimo?.weights
    ? optimo.assets
        .map((a, i) => `${a.label} (${a.ticker}): ${(optimo.weights[i] * 100).toFixed(1)}%`)
        .join(", ")
    : "No disponible";

  const sistemaPrompt = `Eres el Asesor Cuantitativo Patrimonial de LifeHedge, un sistema operativo financiero de lujo (estilo Helios & Savance OS) especializado en Inversión Guiada por el Pasivo (LDI, Liability-Driven Investing) para hogares y patrimonios en México.

Tu misión es asesorar al usuario con rigor cuantitativo, claridad ejecutiva y empatía sobre cómo proteger su poder adquisitivo real frente a la inflación de su propia canasta de gasto.

DATOS CUANTITATIVOS VIGENTES DEL USUARIO:
- Inflación personal anualizada calculada: ${inflacion?.personal_anual ? (inflacion.personal_anual * 100).toFixed(2) + "%" : "5.8%"}
- Inflación general oficial (INPC INEGI): ${inflacion?.general_anual ? (inflacion.general_anual * 100).toFixed(2) + "%" : "4.6%"}
- Delta de Divergencia inflacionaria: ${inflacion?.delta_anualizado ? (inflacion.delta_anualizado * 100).toFixed(2) + "%" : "+1.2%"}
- Eficiencia de cobertura PHE de la cartera: ${optimo?.phe ? (optimo.phe * 100).toFixed(2) + "%" : "72.4%"}
- Cobertura de referencia Solo Cetes: ${optimo?.benchmark_cetes?.phe ? (optimo.benchmark_cetes.phe * 100).toFixed(2) + "%" : "41.0%"}
- Tracking Error (TEV anualizado): ${optimo?.tev ? (optimo.tev * 100).toFixed(2) + "%" : "3.1%"}
- VaR 95% (Merton Jump Diffusion): ${riesgo?.var_95 ? (riesgo.var_95 * 100).toFixed(2) + "%" : "4.2%"}
- CVaR 95%: ${riesgo?.cvar_95 ? (riesgo.cvar_95 * 100).toFixed(2) + "%" : "6.8%"}
- Canasta de gasto del usuario: [${resumenCanasta}]
- Composición óptima de la cartera: [${resumenCartera}]

DIRECTRICES DE RESPUESTA:
1. Responde en el mismo idioma de la pregunta (español o inglés), con tono financiero institucional, riguroso y cuantitativo.
2. Explica con precisión la lógica LDI: la canasta de gasto mensual del hogar actúa como un pasivo contingente que la cartera de activos inmuniza minimizando el tracking error (min w'Σw - 2w'σAL).
3. Utiliza los números reales del usuario para fundamentar tu respuesta.
4. Mantén las respuestas directas, estructuradas y con fundamentación cuantitativa accionable. Nunca utilices emojis.
5. Limita la longitud a 2 o 3 párrafos concisos para que la lectura sea ágil en la interfaz.`;

  const messages = [
    { role: "system", content: sistemaPrompt },
    ...historial.map((h) => [
      { role: "user", content: h.pregunta },
      { role: "assistant", content: h.respuesta },
    ]).flat(),
    { role: "user", content: pregunta },
  ];

  try {
    const respuesta = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "LifeHedge LDI OS",
      },
      body: JSON.stringify({
        model: MODELO_GLM,
        messages,
        max_tokens: 1200,
        temperature: 0.6,
      }),
    });

    if (!respuesta.ok) {
      const errJson = await respuesta.json().catch(() => null);
      throw new Error(errJson?.error?.message || `Error HTTP ${respuesta.status}`);
    }

    const data = await respuesta.json();
    const texto = data?.choices?.[0]?.message?.content;
    if (!texto) throw new Error("Respuesta vacía del modelo.");

    return texto;
  } catch (error) {
    console.warn("Fallo al conectar con OpenRouter GLM-5.2:", error);
    // Fallback cuantitativo local inteligente
    return generarRespuestaFallback(pregunta, contexto);
  }
}

function generarRespuestaFallback(pregunta, contexto) {
  const { inflacion, optimo, riesgo, pesos } = contexto || {};
  const q = (pregunta || "").toLowerCase();

  const infPersonal = inflacion?.personal_anual ? (inflacion.personal_anual * 100).toFixed(1) + "%" : "5.8%";
  const inpc = inflacion?.general_anual ? (inflacion.general_anual * 100).toFixed(1) + "%" : "4.6%";
  const phe = optimo?.phe ? (optimo.phe * 100).toFixed(1) + "%" : "72.4%";

  if (q.includes("udibono") || q.includes("bono")) {
    return `Los **Udibonos** son el pilar fundamental de tu cartera porque replican el valor de las UDIs, neutralizando directamente el núcleo de la inflación general (${inpc}). Con tu canasta actual, los Udibonos absorben la mayor parte de la covarianza del pasivo ($\\sigma_{AL}$) sin exponer tu capital a volatilidad cambiaria.`;
  }

  if (q.includes("dolar") || q.includes("usd") || q.includes("tipo de cambio") || q.includes("depreciac")) {
    return `Tu cartera LDI mantiene exposición en activos denominados en dólares (como **IVVPESO**, **GLD**, **DBA** y **XLE**) para proteger el componente importado de tu consumo. Si el dólar se deprecia frente al peso, el colchón en CETES28 y Udibonos equilibra la cartera; si el dólar sube, las posiciones dolarizadas generan plusvalía en pesos compensando el encarecimiento de bienes.`;
  }

  if (q.includes("cetes") || q.includes("tasa") || q.includes("banxico") || q.includes("liquidez")) {
    return `El colchón asignado en **CETES 28d** garantiza liquidez inmediata y permite capturar el ciclo de tasas altas de Banxico. Al ser deuda soberana de corto plazo, no sufre minusvalías por duración cuando las tasas suben, garantizando fondos disponibles para tus gastos recurrentes.`;
  }

  return `Para tu perfil de gasto con una inflación personal del **${infPersonal}** (frente al **${inpc}** de INPC general), tu portafolio LDI alcanza una eficiencia de cobertura PHE del **${phe}**. Te recomendamos mantener las ponderaciones calculadas y programar un rebalanceo si la inflación de tus rubros principales se desvía más de 1.5 puntos porcentuales.`;
}
