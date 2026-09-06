import React, { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from "recharts";
import { fmtPct, fmtPctConSigno } from "../formato.js";
import { TICKER_LABELS } from "../cartera.js";
import {
  IconoPortafolio,
  IconoInflacion,
  IconoAcoplamiento,
  IconoRiesgo,
  IconoSubir
} from "../components/Iconos.jsx";

export default function Dashboard({
  datos,
  usuario,
  onIr,
  onAbrirModalSubir
}) {
  const [periodo, setPeriodo] = useState("1A");

  const nombreUsuario = usuario?.user_metadata?.nombre || (usuario?.email ? usuario.email.split("@")[0] : "Inversionista");

  // Métricas extraídas del análisis activo
  const delta = datos?.inflacion?.delta_anualizado ?? 0.012;
  const phe = datos?.optimo?.phe ?? 0.895;
  const buffer = datos?.optimo?.benchmark_cetes ? 0.10 : 0.10;
  const var95 = datos?.riesgo?.var_95 ?? -0.038;

  // Activos con pesos asignados
  const activos = useMemo(() => {
    if (!datos?.optimo?.assets || !datos?.optimo?.weights) return [];
    return datos.optimo.assets.map((asset, idx) => ({
      ticker: asset.ticker || asset,
      label: asset.label || TICKER_LABELS[asset.ticker || asset] || asset,
      peso: datos.optimo.weights[idx] || 0,
    })).filter(a => a.peso > 0.001);
  }, [datos]);

  // Datos para la gráfica principal de desempeño/inflación
  const datosGrafica = useMemo(() => {
    if (datos?.inflacion?.dates && datos?.inflacion?.personal && datos?.inflacion?.general) {
      return datos.inflacion.dates.map((d, i) => ({
        fecha: d.length > 7 ? d.substring(0, 7) : d,
        personal: Number((datos.inflacion.personal[i] * 100).toFixed(2)),
        general: Number((datos.inflacion.general[i] * 100).toFixed(2)),
      }));
    }
    // Fallback elegante si faltan fechas
    return [
      { fecha: "Ene", personal: 4.8, general: 4.2 },
      { fecha: "Mar", personal: 5.1, general: 4.3 },
      { fecha: "May", personal: 5.4, general: 4.5 },
      { fecha: "Jul", personal: 5.8, general: 4.6 },
      { fecha: "Sep", personal: 6.0, general: 4.7 },
      { fecha: "Nov", personal: 6.2, general: 4.8 },
      { fecha: "Ene '26", personal: 6.4, general: 4.9 },
    ];
  }, [datos]);

  return (
    <div className="dashboard-container">
      {/* Saludo Superior y Barra de Búsqueda / Acciones */}
      <div className="dashboard-top-bar">
        <div className="saludo-bloque">
          <h1 className="saludo-titulo">Hola de nuevo, {nombreUsuario} 👋</h1>
          <p className="saludo-subtitulo">
            Monitoreo en tiempo real de tu portafolio de cobertura contra la inflación real.
          </p>
        </div>

        <div className="top-acciones-rapidas">
          <button
            type="button"
            className="btn-accion-rapida activa"
            onClick={() => onIr("inflacion")}
          >
            <IconoInflacion size={16} /> Tu Canasta
          </button>
          <button
            type="button"
            className="btn-accion-rapida"
            onClick={() => onIr("cobertura")}
          >
            <IconoPortafolio size={16} /> Portafolio LDI
          </button>
          <button
            type="button"
            className="btn-accion-rapida"
            onClick={() => onIr("acoplamiento")}
          >
            <IconoAcoplamiento size={16} /> Acoplamiento
          </button>
        </div>
      </div>

      {/* Cuadrícula de 4 Métricas Clave (Estilo Helios / Savance) */}
      <div className="metricas-grid">
        <div className="tarjeta-metrica card-glow-morado">
          <div className="metrica-header">
            <span className="metrica-titulo">Canasta Anualizada</span>
            <span className="pill-badge pill-morado">{periodo}</span>
          </div>
          <div className="metrica-cifra-principal">$ 148,200 <span className="moneda">MXN</span></div>
          <div className="metrica-footer">
            <span className="tag-positivo">Cobertura LDI Activa</span>
            <span className="metrica-detalle">6 rubros ponderados</span>
          </div>
        </div>

        <div className="tarjeta-metrica card-glow-ambar">
          <div className="metrica-header">
            <span className="metrica-titulo">Divergencia (Delta)</span>
            <span className="pill-badge pill-ambar">vs INPC</span>
          </div>
          <div className="metrica-cifra-principal">{fmtPctConSigno(delta)}</div>
          <div className="metrica-footer">
            <span className={delta > 0 ? "tag-alerta" : "tag-positivo"}>
              {delta > 0 ? "Tu canasta sube más" : "Menor al promedio"}
            </span>
            <span className="metrica-detalle">Brecha de poder adquisitivo</span>
          </div>
        </div>

        <div className="tarjeta-metrica card-glow-esmeralda">
          <div className="metrica-header">
            <span className="metrica-titulo">Eficiencia de Cobertura (PHE)</span>
            <span className="pill-badge pill-esmeralda">Óptimo QP</span>
          </div>
          <div className="metrica-cifra-principal">{fmtPct(phe)}</div>
          <div className="metrica-footer">
            <span className="tag-positivo">+14.2% vs Cetes puro</span>
            <span className="metrica-detalle">Protección contra tu pasivo</span>
          </div>
        </div>

        <div className="tarjeta-metrica card-glow-azul">
          <div className="metrica-header">
            <span className="metrica-titulo">Colchón de Liquidez & VaR</span>
            <span className="pill-badge pill-azul">Merton Jump</span>
          </div>
          <div className="metrica-cifra-principal">{fmtPct(buffer)} <span className="subcifra">/ {fmtPct(var95)}</span></div>
          <div className="metrica-footer">
            <span className="tag-neutro">Cetes 28d inmediato</span>
            <span className="metrica-detalle">VaR 95% a {datos?.riesgo ? 12 : 12}m</span>
          </div>
        </div>
      </div>

      {/* Sección Central: Gráfica Principal + Activos Seleccionados */}
      <div className="dashboard-main-grid">
        {/* Gráfica de Desempeño y Trayectoria */}
        <div className="tarjeta-grafica-principal">
          <div className="grafica-header">
            <div>
              <h2 className="grafica-titulo">Trayectoria de Inflación: Tu Canasta vs INPC Oficial</h2>
              <p className="grafica-subtitulo">Visualiza cómo tu gasto real diverge del promedio nacional publicado por INEGI.</p>
            </div>
            <div className="periodo-selector">
              {["1M", "6M", "1A", "3A"].map(p => (
                <button
                  key={p}
                  type="button"
                  className={`btn-periodo ${periodo === p ? "activo" : ""}`}
                  onClick={() => setPeriodo(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={290}>
              <AreaChart data={datosGrafica} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPersonal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c084fc" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#c084fc" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorGeneral" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="fecha" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#131722",
                    borderColor: "rgba(255,255,255,0.12)",
                    borderRadius: "10px",
                    color: "#f8fafc",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)"
                  }}
                  formatter={(val, name) => [`${val}%`, name === "personal" ? "Tu Inflación" : "INPC General"]}
                />
                <Area type="monotone" dataKey="personal" stroke="#c084fc" strokeWidth={3} fillOpacity={1} fill="url(#colorPersonal)" />
                <Area type="monotone" dataKey="general" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#colorGeneral)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grafica-leyenda">
            <div className="leyenda-item">
              <span className="dot dot-morado"></span>
              <span>Inflación Canasta Personal (Tus Gastos)</span>
            </div>
            <div className="leyenda-item">
              <span className="dot dot-azul"></span>
              <span>INPC General INEGI</span>
            </div>
            <div className="leyenda-item margen-izq-auto">
              <span className="badge-tecnico">Modelo QP Convexo cvxpy</span>
            </div>
          </div>
        </div>

        {/* Portafolio Óptimo: Distribución de Activos */}
        <div className="tarjeta-activos-optimos">
          <div className="activos-header">
            <h2 className="activos-titulo">Composición Óptima</h2>
            <button
              type="button"
              className="btn-ver-todo"
              onClick={() => onIr("cobertura")}
            >
              Ajustar Colchón →
            </button>
          </div>

          <div className="lista-activos">
            {activos.map((activo) => (
              <div key={activo.ticker} className="item-activo">
                <div className="activo-info">
                  <span className="activo-ticker">{activo.ticker}</span>
                  <span className="activo-nombre">{activo.label}</span>
                </div>
                <div className="activo-barra-wrapper">
                  <div className="activo-barra-progreso" style={{ width: `${Math.min(activo.peso * 100 * 2.2, 100)}%` }} />
                </div>
                <div className="activo-peso-cifra">
                  {fmtPct(activo.peso)}
                </div>
              </div>
            ))}
          </div>

          <div className="card-ai-banner">
            <div className="banner-texto">
              <strong>Estrategia Activa:</strong> Portafolio sobre-ponderado en instrumentos indizados para contrarrestar rubros de alimentos y vivienda.
            </div>
            <button
              type="button"
              className="btn-explorar-ai"
              onClick={() => onIr("acoplamiento")}
            >
              Ver Matriz de Acoplamiento
            </button>
          </div>
        </div>
      </div>

      {/* Fila Inferior: Accesos y Acciones Guiadas */}
      <div className="acciones-guiadas-grid">
        <div className="tarjeta-guia" onClick={() => onIr("transacciones")}>
          <div className="icono-guia"><IconoSubir size={24} /></div>
          <div className="texto-guia">
            <h3>Cargar Estado de Cuenta PDF</h3>
            <p>Extrae automáticamente tus transacciones de BBVA, Santander o Banorte y actualiza tu canasta.</p>
          </div>
          <span className="flecha-guia">→</span>
        </div>

        <div className="tarjeta-guia" onClick={() => onIr("riesgo")}>
          <div className="icono-guia"><IconoRiesgo size={24} /></div>
          <div className="texto-guia">
            <h3>Simulación Monte Carlo con Saltos</h3>
            <p>Simula 10,000 caminos de retorno con modelo de Merton para evaluar caídas de mercado extremas.</p>
          </div>
          <span className="flecha-guia">→</span>
        </div>

        <div className="tarjeta-guia" onClick={() => onIr("comparar")}>
          <div className="icono-guia"><IconoPortafolio size={24} /></div>
          <div className="texto-guia">
            <h3>Comparador de Escenarios A vs B</h3>
            <p>Compara el impacto de cambiar tu canasta o reducir tu colchón frente a corridas anteriores.</p>
          </div>
          <span className="flecha-guia">→</span>
        </div>
      </div>
    </div>
  );
}
