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
import { useLanguage } from "../i18n/LanguageContext.jsx";
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
  onIr
}) {
  const [periodo, setPeriodo] = useState("1A");
  const { t, esIngles } = useLanguage();

  const nombreUsuario = usuario?.user_metadata?.nombre || (usuario?.email ? usuario.email.split("@")[0] : (esIngles ? "Investor" : "Inversionista"));

  // Métricas extraídas del análisis activo, sin valores demostrativos inventados.
  const delta = datos?.inflacion?.delta_anualizado ?? 0;
  const inflacionPersonal = datos?.inflacion?.personal_anual ?? 0;
  const inflacionGeneral = datos?.inflacion?.general_anual ?? 0;
  const phe = datos?.optimo?.phe ?? 0;
  const pheCetes = datos?.optimo?.benchmark_cetes?.phe ?? 0;
  const var95 = datos?.riesgo?.var_95 ?? 0;

  const indiceCetes = datos?.optimo?.assets?.findIndex((asset) =>
    (asset.ticker || asset) === "CETES28"
  ) ?? -1;
  const buffer = indiceCetes >= 0 ? (datos?.optimo?.weights?.[indiceCetes] ?? 0) : 0;

  // Activos con pesos asignados
  const activos = useMemo(() => {
    if (!datos?.optimo?.assets || !datos?.optimo?.weights) return [];
    return datos.optimo.assets.map((asset, idx) => ({
      ticker: asset.ticker || asset,
      label: asset.label || TICKER_LABELS[asset.ticker || asset] || asset,
      peso: datos.optimo.weights[idx] || 0,
    })).filter(a => a.peso > 0.001);
  }, [datos]);

  // Convierte las variaciones mensuales observadas en índices acumulados comparables.
  const datosGraficaCompleta = useMemo(() => {
    if (datos?.inflacion?.dates && datos?.inflacion?.personal && datos?.inflacion?.general) {
      let personal = 100;
      let general = 100;

      return datos.inflacion.dates.map((d, i) => {
        if (i > 0) {
          personal *= 1 + (Number(datos.inflacion.personal[i]) || 0);
          general *= 1 + (Number(datos.inflacion.general[i]) || 0);
        }

        return {
          fecha: d.length > 7 ? d.substring(0, 7) : d,
          personal: Number(personal.toFixed(2)),
          general: Number(general.toFixed(2)),
        };
      });
    }
    return [];
  }, [datos]);

  const datosGrafica = useMemo(() => {
    const ventanas = { "6M": 6, "1A": 12, "3A": 36, "Histórico": Infinity };
    const meses = ventanas[periodo] ?? 12;
    const recorte = Number.isFinite(meses)
      ? datosGraficaCompleta.slice(-Math.min(meses + 1, datosGraficaCompleta.length))
      : datosGraficaCompleta;

    if (!recorte.length) return [];
    const basePersonal = recorte[0].personal || 100;
    const baseGeneral = recorte[0].general || 100;

    return recorte.map((punto) => ({
      ...punto,
      personal: Number(((punto.personal / basePersonal) * 100).toFixed(2)),
      general: Number(((punto.general / baseGeneral) * 100).toFixed(2)),
    }));
  }, [datosGraficaCompleta, periodo]);

  return (
    <div className="dashboard-container">
      {/* Saludo Superior y Barra de Búsqueda / Acciones */}
      <div className="dashboard-top-bar">
        <div className="saludo-bloque">
          <h1 className="saludo-titulo">{t("dashboard.welcome", { name: nombreUsuario })}</h1>
          <p className="saludo-subtitulo">
            {t("dashboard.subtitle")}
          </p>
        </div>

        <div className="top-acciones-rapidas">
          <button
            type="button"
            className="btn-accion-rapida activa"
            onClick={() => onIr("inflacion")}
          >
            <IconoInflacion size={16} /> {t("dashboard.yourBasket")}
          </button>
          <button
            type="button"
            className="btn-accion-rapida"
            onClick={() => onIr("cobertura")}
          >
            <IconoPortafolio size={16} /> {t("dashboard.ldiPortfolio")}
          </button>
          <button
            type="button"
            className="btn-accion-rapida"
            onClick={() => onIr("acoplamiento")}
          >
            <IconoAcoplamiento size={16} /> {t("dashboard.coupling")}
          </button>
        </div>
      </div>

      {/* Cuadrícula de 4 Métricas Clave (Estilo Helios / Savance) */}
      <div className="metricas-grid">
        <div className="tarjeta-metrica card-glow-morado">
          <div className="metrica-header">
            <span className="metrica-titulo">{t("dashboard.basketInflation")}</span>
            <span className="pill-badge pill-morado">{periodo}</span>
          </div>
          <div className="metrica-cifra-principal">{fmtPct(inflacionPersonal)}</div>
          <div className="metrica-footer">
            <span className="tag-positivo">{t("dashboard.ldiActive")}</span>
            <span className="metrica-detalle">{t("dashboard.generalInpc")}: {fmtPct(inflacionGeneral)}</span>
          </div>
        </div>

        <div className="tarjeta-metrica card-glow-ambar">
          <div className="metrica-header">
            <span className="metrica-titulo">{t("dashboard.deltaTitle")}</span>
            <span className="pill-badge pill-ambar">vs INPC</span>
          </div>
          <div className="metrica-cifra-principal">{fmtPctConSigno(delta)}</div>
          <div className="metrica-footer">
            <span className={delta > 0 ? "tag-alerta" : "tag-positivo"}>
              {delta > 0 ? t("dashboard.basketRisesMore") : t("dashboard.basketRisesLess")}
            </span>
            <span className="metrica-detalle">{t("dashboard.purchasingPowerGap")}</span>
          </div>
        </div>

        <div className="tarjeta-metrica card-glow-esmeralda">
          <div className="metrica-header">
            <span className="metrica-titulo">{t("dashboard.pheTitle")}</span>
            <span className="pill-badge pill-esmeralda">Óptimo QP</span>
          </div>
          <div className="metrica-cifra-principal">{fmtPct(phe)}</div>
          <div className="metrica-footer">
            <span className={phe >= pheCetes ? "tag-positivo" : "tag-alerta"}>
              {fmtPctConSigno(phe - pheCetes)} {t("dashboard.vsPureCetes")}
            </span>
            <span className="metrica-detalle">{t("dashboard.liabilityProtection")}</span>
          </div>
        </div>

        <div className="tarjeta-metrica card-glow-azul">
          <div className="metrica-header">
            <span className="metrica-titulo">{t("dashboard.liquidityVarTitle")}</span>
            <span className="pill-badge pill-azul">Merton Jump</span>
          </div>
          <div className="metrica-cifra-principal">{fmtPct(buffer)} <span className="subcifra">/ {fmtPct(var95)}</span></div>
          <div className="metrica-footer">
            <span className="tag-neutro">{t("dashboard.liquidityBuffer")}</span>
            <span className="metrica-detalle">{t("dashboard.varAtHorizon")}</span>
          </div>
        </div>
      </div>

      {/* Sección Central: Gráfica Principal + Activos Seleccionados */}
      <div className="dashboard-main-grid">
        {/* Gráfica de Desempeño y Trayectoria */}
        <div className="tarjeta-grafica-principal">
          <div className="grafica-header">
            <div>
              <h2 className="grafica-titulo">{t("dashboard.chartTitle")}</h2>
              <p className="grafica-subtitulo">{t("dashboard.chartSubtitle")}</p>
            </div>
            <div className="periodo-selector">
              {[
                { id: "6M", label: t("dashboard.period6M") },
                { id: "1A", label: t("dashboard.period1Y") },
                { id: "3A", label: t("dashboard.period3Y") },
                { id: "Histórico", label: t("dashboard.periodMax") },
              ].map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`btn-periodo ${periodo === item.id ? "activo" : ""}`}
                  onClick={() => setPeriodo(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={290}>
              <AreaChart data={datosGrafica} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPersonal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f8cc1b" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#f8cc1b" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="colorGeneral" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8d959c" stopOpacity={0.14} />
                    <stop offset="95%" stopColor="#8d959c" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 5" stroke="#292e32" vertical={false} />
                <XAxis dataKey="fecha" stroke="#7f878e" fontSize={12} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis stroke="#7f878e" fontSize={12} tickLine={false} axisLine={false} domain={["auto", "auto"]} tickFormatter={v => Number(v).toFixed(0)} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#111315",
                    borderColor: "#34393f",
                    borderRadius: "8px",
                    color: "#f1f3f4",
                    boxShadow: "0 16px 38px rgba(0, 0, 0, 0.28)"
                  }}
                  formatter={(val, name) => [Number(val).toFixed(2), name === "personal" ? t("dashboard.yourBasket") : t("dashboard.generalInpc")]}
                />
                <Area type="linear" dataKey="personal" stroke="#f8cc1b" strokeWidth={2.4} fillOpacity={1} fill="url(#colorPersonal)" dot={false} activeDot={{ r: 4 }} />
                <Area type="linear" dataKey="general" stroke="#8d959c" strokeWidth={1.8} fillOpacity={1} fill="url(#colorGeneral)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grafica-leyenda">
            <div className="leyenda-item">
              <span className="dot dot-morado"></span>
              <span>{t("dashboard.yourBasket")}</span>
            </div>
            <div className="leyenda-item">
              <span className="dot dot-azul"></span>
              <span>{t("dashboard.generalInpc")}</span>
            </div>
            <div className="leyenda-item margen-izq-auto">
              <span className="badge-tecnico">QP Model (cvxpy)</span>
            </div>
          </div>
        </div>

        {/* Portafolio Óptimo: Distribución de Activos */}
        <div className="tarjeta-activos-optimos">
          <div className="activos-header">
            <h2 className="activos-titulo">{t("dashboard.optimalDistribution")}</h2>
            <button
              type="button"
              className="btn-ver-todo"
              onClick={() => onIr("cobertura")}
            >
              {esIngles ? "Adjust Buffer →" : "Ajustar Colchón →"}
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
                  <div className="activo-barra-progreso" style={{ width: `${Math.min(activo.peso * 100, 100)}%` }} />
                </div>
                <div className="activo-peso-cifra">
                  {fmtPct(activo.peso)}
                </div>
              </div>
            ))}
          </div>

          <div className="card-ai-banner">
            <div className="banner-texto">
              <strong>Estrategia Activa:</strong> Portafolio sobreponderado en instrumentos indexados para contrarrestar los rubros de alimentos y vivienda.
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
            <h3>Cargar Estado de Cuenta en PDF</h3>
            <p>Extrae automáticamente tus transacciones de BBVA, Santander, Banorte o Citibanamex y actualiza tu canasta.</p>
          </div>
          <span className="flecha-guia">→</span>
        </div>

        <div className="tarjeta-guia" onClick={() => onIr("riesgo")}>
          <div className="icono-guia"><IconoRiesgo size={24} /></div>
          <div className="texto-guia">
            <h3>Simulación Monte Carlo con Saltos</h3>
            <p>Simula 1,000 caminos de retorno con modelo de Merton para evaluar caídas de mercado extremas.</p>
          </div>
          <span className="flecha-guia">→</span>
        </div>

        <div className="tarjeta-guia" onClick={() => onIr("comparar")}>
          <div className="icono-guia"><IconoPortafolio size={24} /></div>
          <div className="texto-guia">
            <h3>Comparador de Escenarios (A vs. B)</h3>
            <p>Compara el impacto de cambiar tu canasta o reducir tu colchón frente a análisis anteriores.</p>
          </div>
          <span className="flecha-guia">→</span>
        </div>
      </div>
    </div>
  );
}
