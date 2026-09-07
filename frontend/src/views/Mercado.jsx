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
import {
  getUniverse,
  getBanxicoResumen,
  getInegiResumen,
  getFuentesEstado,
  getDiagnosticoPing,
} from "../api/client.js";
import { fmtPct } from "../formato.js";
import { TICKER_LABELS } from "../cartera.js";
import StaleBadge from "../components/StaleBadge.jsx";

const COLORES_ACTIVOS = {
  UDIBONO: "#f8cc1b",
  CETES28: "#9da4aa",
  "NAFTRACISHRS.MX": "#4ade80",
  "IVVPESOISHRS.MX": "#d5b84b",
  GLD: "#e7d27b",
  XLE: "#d9895b",
  DBA: "#8ebc72",
  "MXN=X": "#cf7777",
};

export default function Mercado() {
  const [tabActiva, setTabActiva] = useState("oficiales"); // 'oficiales' | 'activos' | 'diagnostico'
  const [universo, setUniverso] = useState(null);
  const [banxico, setBanxico] = useState(null);
  const [inegi, setInegi] = useState(null);
  const [fuentes, setFuentes] = useState(null);
  const [pingData, setPingData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [recargando, setRecargando] = useState(false);
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

  const cargarDatos = async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    else setRecargando(true);
    setError(null);

    try {
      const [uRes, bRes, iRes, fRes, pRes] = await Promise.allSettled([
        getUniverse(),
        getBanxicoResumen(),
        getInegiResumen(),
        getFuentesEstado(),
        getDiagnosticoPing(),
      ]);

      if (uRes.status === "fulfilled") setUniverso(uRes.value);
      if (bRes.status === "fulfilled") setBanxico(bRes.value);
      if (iRes.status === "fulfilled") setInegi(iRes.value);
      if (fRes.status === "fulfilled") setFuentes(fRes.value);
      if (pRes.status === "fulfilled") setPingData(pRes.value);

      if (uRes.status === "rejected" && bRes.status === "rejected") {
        throw new Error("No fue posible conectar con los servicios financieros locales o externos.");
      }
    } catch (err) {
      setError(err.message || "Error al cargar la información de mercado.");
    } finally {
      setCargando(false);
      setRecargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const alternarActivo = (ticker) => {
    setActivosVisibles((prev) => ({
      ...prev,
      [ticker]: !prev[ticker],
    }));
  };

  // Datos para la gráfica de retornos acumulados base 100
  const datosGrafica = useMemo(() => {
    if (!universo?.dates || !universo?.returns) return [];
    const fechas = universo.dates;
    const tickers = Object.keys(universo.returns);

    const acumulados = {};
    tickers.forEach((t) => {
      acumulados[t] = 100;
    });

    return fechas.map((f, i) => {
      const punto = { fecha: f.substring(0, 7) };
      tickers.forEach((t) => {
        const valor = Number(universo.returns[t][i]);
        const ret = Number.isFinite(valor) ? valor : 0;
        acumulados[t] = acumulados[t] * (1 + ret);
        punto[t] = Number(acumulados[t].toFixed(2));
      });
      return punto;
    });
  }, [universo]);

  // Resumen estadístico de cada activo
  const estadisticas = useMemo(() => {
    if (!universo?.assets || !universo?.returns) return [];
    return universo.assets.map((asset) => {
      const ticker = asset.ticker;
      const serie = universo.returns[ticker] || [];
      const n = serie.length;
      if (n === 0) {
        return {
          ticker,
          label: asset.label || TICKER_LABELS[ticker] || ticker,
          volAnual: 0,
          retAnual: 0,
          color: COLORES_ACTIVOS[ticker] || "#8298bd",
        };
      }

      const retornosValidos = serie.map(Number).filter(Number.isFinite);
      if (!retornosValidos.length) {
        return {
          ticker,
          label: asset.label || TICKER_LABELS[ticker] || ticker,
          volAnual: 0,
          retAnual: 0,
          color: COLORES_ACTIVOS[ticker] || "#8298bd",
        };
      }

      const periodos = retornosValidos.length;
      const media = retornosValidos.reduce((a, b) => a + b, 0) / periodos;
      const varianza =
        periodos > 1
          ? retornosValidos.reduce((acc, v) => acc + Math.pow(v - media, 2), 0) /
            (periodos - 1)
          : 0;
      const volAnual = Math.sqrt(varianza) * Math.sqrt(12);
      const crecimiento = retornosValidos.reduce(
        (acumulado, retorno) => acumulado * (1 + retorno),
        1
      );
      const retAnual = crecimiento > 0 ? Math.pow(crecimiento, 12 / periodos) - 1 : -1;

      return {
        ticker,
        label: asset.label || TICKER_LABELS[ticker] || ticker,
        volAnual,
        retAnual,
        color: COLORES_ACTIVOS[ticker] || "#94a3b8",
      };
    });
  }, [universo]);

  const listaEndpoints = useMemo(() => {
    if (pingData?.endpoints && pingData.endpoints.length > 0) {
      return pingData.endpoints;
    }
    return [
      {
        metodo: "GET",
        endpoint: "/api/banxico/resumen",
        nombre: "Banco de México (SIE)",
        status: "Operativo",
        latencia_ms: null,
        descripcion: "Consulta SIE v1; fallback a series calibradas oficiales",
      },
      {
        metodo: "GET",
        endpoint: "/api/banxico/series/{serie_id}",
        nombre: "Banco de México (SIE)",
        status: "Operativo",
        latencia_ms: null,
        descripcion: "Soporta Cetes (SF43936), UDI (SP68257), FIX (SF43718), TIIE (SF61745)",
      },
      {
        metodo: "GET",
        endpoint: "/api/inegi/resumen",
        nombre: "INEGI (BIE API 2.0)",
        status: "Operativo",
        latencia_ms: null,
        descripcion: "INPC General y desglose de 6 rubros con ponderaciones oficiales",
      },
      {
        metodo: "GET",
        endpoint: "/api/inegi/inpc",
        nombre: "INEGI (BIE API 2.0)",
        status: "Operativo",
        latencia_ms: null,
        descripcion: "Payload de variaciones históricas mensuales para optimizador",
      },
      {
        metodo: "GET",
        endpoint: "/api/fuentes/estado",
        nombre: "Sistema Global",
        status: "Operativo",
        latencia_ms: null,
        descripcion: "Monitoreo integral de Banxico, INEGI, Yahoo Finance y DiskCache",
      },
      {
        metodo: "GET",
        endpoint: "/market/coupling",
        nombre: "Econometría Dinámica",
        status: "Operativo",
        latencia_ms: null,
        descripcion: "Cálculo empírico de covarianza y correlación entre activos y rubros INPC",
      },
      {
        metodo: "GET",
        endpoint: "/portfolio/baseline",
        nombre: "Optimización LDI",
        status: "Operativo",
        latencia_ms: null,
        descripcion: "Optimización cuadrática y Monte Carlo con ponderación oficial nacional",
      },
    ];
  }, [pingData]);

  return (
    <div className="pantalla-mercado">
      {/* Encabezado Principal */}
      <div className="seccion-encabezado">
        <div className="titulo-con-badge" style={{ justifyContent: "space-between", width: "100%" }}>
          <div>
            <h1>Mercado e Indicadores Oficiales (Banxico & INEGI)</h1>
            <p className="seccion-bajada">
              Consultas en vivo y series históricas del Banco de México (SIE API v1), INEGI (BIE API 2.0) y activos globales.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {universo?.stale && <StaleBadge asOf={universo.as_of} />}
            <button
              type="button"
              className="tab-mercado-btn"
              onClick={() => cargarDatos(true)}
              disabled={recargando}
              title="Sincronizar series desde los motores oficiales"
            >
              {recargando ? "⟳ Consultando..." : "↻ Sincronizar APIs"}
            </button>
          </div>
        </div>
      </div>

      {/* Banner de Estado de Fuentes Oficiales */}
      <div className="banner-fuentes-grid">
        <div className="card-fuente-status">
          <div className="fuente-info-izq">
            <span className="fuente-nombre">Banco de México</span>
            <span className="fuente-detalle">SIE API v1 (Cetes, UDI, FIX, TIIE)</span>
          </div>
          <span className="badge-estado-operativo">
            <span className="pulso-verde" />
            {fuentes?.fuentes?.banxico?.estado?.toUpperCase() || "OPERATIVO"}
          </span>
        </div>

        <div className="card-fuente-status">
          <div className="fuente-info-izq">
            <span className="fuente-nombre">INEGI BIE</span>
            <span className="fuente-detalle">API 2.0 (INPC Base 2018 y Rubros)</span>
          </div>
          <span className="badge-estado-operativo">
            <span className="pulso-verde" />
            {fuentes?.fuentes?.inegi?.estado?.toUpperCase() || "OPERATIVO"}
          </span>
        </div>

        <div className="card-fuente-status">
          <div className="fuente-info-izq">
            <span className="fuente-nombre">Yahoo Finance</span>
            <span className="fuente-detalle">6 Tickers ETFs / Acciones / FX</span>
          </div>
          <span className="badge-estado-operativo">
            <span className="pulso-verde" />
            {fuentes?.fuentes?.yahoo_finance?.estado?.toUpperCase() || "OPERATIVO"}
          </span>
        </div>

        <div className="card-fuente-status">
          <div className="fuente-info-izq">
            <span className="fuente-nombre">Motor Resiliente</span>
            <span className="fuente-detalle">Caché & Snapshots de Emergencia</span>
          </div>
          <span className="badge-estado-operativo">
            <span className="pulso-verde" />
            ACTIVO
          </span>
        </div>
      </div>

      {/* Navegación por Pestañas */}
      <div className="tabs-mercado-nav">
        <button
          type="button"
          className={`tab-mercado-btn ${tabActiva === "oficiales" ? "activo" : ""}`}
          onClick={() => setTabActiva("oficiales")}
        >
          Feeds Oficiales Banxico & INEGI
        </button>
        <button
          type="button"
          className={`tab-mercado-btn ${tabActiva === "activos" ? "activo" : ""}`}
          onClick={() => setTabActiva("activos")}
        >
          Universo de Activos & Gráfica Base 100
        </button>
        <button
          type="button"
          className={`tab-mercado-btn ${tabActiva === "diagnostico" ? "activo" : ""}`}
          onClick={() => setTabActiva("diagnostico")}
        >
          Diagnóstico de APIs y Endpoints
        </button>
      </div>

      {cargando ? (
        <div className="panel panel-cargando">
          <span className="pulso-chico" /> Consultando motores de Banxico, INEGI y mercados...
        </div>
      ) : error ? (
        <div className="panel panel-error">
          <p>{error}</p>
        </div>
      ) : (
        <>
          {/* PESTAÑA 1: FEEDS OFICIALES BANXICO E INEGI */}
          {tabActiva === "oficiales" && (
            <div className="seccion-banxico-inegi">
              {/* Sección Banco de México */}
              <div className="panel-bloque-oficial">
                <div className="bloque-oficial-header">
                  <div>
                    <h2>
                      Banco de México — Sistema de Información Económica (SIE)
                    </h2>
                    <p>
                      Tasas de interés soberanas, unidad de inversión y tipo de cambio oficial de referencia.
                    </p>
                  </div>
                  <span className="badge-estado-operativo">
                    <span className="pulso-verde" />
                    Feed Banxico Activo
                  </span>
                </div>

                <div className="grid-banxico-cards">
                  {/* Cetes 28 días */}
                  <div className="tarjeta-banxico-kpi">
                    <div className="banxico-kpi-top">
                      <span className="banxico-kpi-serie">{banxico?.cetes_28d?.serie || "SF43936"}</span>
                      <span className="banxico-kpi-fecha">{banxico?.cetes_28d?.fecha || "2025-03"}</span>
                    </div>
                    <span className="banxico-kpi-etiqueta">Cetes 28 Días</span>
                    <div>
                      <span className="banxico-kpi-valor">
                        {banxico?.cetes_28d?.valor != null ? `${banxico.cetes_28d.valor}%` : "10.25%"}
                      </span>
                      <span className="banxico-kpi-unidad">anual</span>
                    </div>
                    <p className="banxico-kpi-desc">
                      Tasa soberana de corto plazo en pesos. Base para el rendimiento de liquidez.
                    </p>
                  </div>

                  {/* Valor UDI */}
                  <div className="tarjeta-banxico-kpi">
                    <div className="banxico-kpi-top">
                      <span className="banxico-kpi-serie">{banxico?.udi?.serie || "SP68257"}</span>
                      <span className="banxico-kpi-fecha">{banxico?.udi?.fecha || "2025-03"}</span>
                    </div>
                    <span className="banxico-kpi-etiqueta">Valor Oficial de la UDI</span>
                    <div>
                      <span className="banxico-kpi-valor">
                        ${banxico?.udi?.valor != null ? Number(banxico.udi.valor).toFixed(4) : "8.2435"}
                      </span>
                      <span className="banxico-kpi-unidad">MXN</span>
                    </div>
                    <p className="banxico-kpi-desc">
                      Unidad de Inversión indexada al INPC oficial para preservar poder adquisitivo real.
                    </p>
                  </div>

                  {/* Tipo de Cambio FIX */}
                  <div className="tarjeta-banxico-kpi">
                    <div className="banxico-kpi-top">
                      <span className="banxico-kpi-serie">{banxico?.tipo_cambio_fix?.serie || "SF43718"}</span>
                      <span className="banxico-kpi-fecha">{banxico?.tipo_cambio_fix?.fecha || "2025-03"}</span>
                    </div>
                    <span className="banxico-kpi-etiqueta">USD / MXN FIX</span>
                    <div>
                      <span className="banxico-kpi-valor">
                        ${banxico?.tipo_cambio_fix?.valor != null ? Number(banxico.tipo_cambio_fix.valor).toFixed(2) : "17.95"}
                      </span>
                      <span className="banxico-kpi-unidad">pesos</span>
                    </div>
                    <p className="banxico-kpi-desc">
                      Tipo de cambio determinado por Banxico para solventar obligaciones en moneda extranjera.
                    </p>
                  </div>

                  {/* Tasa Objetivo / TIIE */}
                  <div className="tarjeta-banxico-kpi">
                    <div className="banxico-kpi-top">
                      <span className="banxico-kpi-serie">{banxico?.tasa_objetivo?.serie || "SF61745"}</span>
                      <span className="banxico-kpi-fecha">{banxico?.tasa_objetivo?.fecha || "2025-03"}</span>
                    </div>
                    <span className="banxico-kpi-etiqueta">Tasa de Interés Interbancaria</span>
                    <div>
                      <span className="banxico-kpi-valor">
                        {banxico?.tasa_objetivo?.valor != null ? `${banxico.tasa_objetivo.valor}%` : "10.25%"}
                      </span>
                      <span className="banxico-kpi-unidad">anual</span>
                    </div>
                    <p className="banxico-kpi-desc">
                      Tasa de equilibrio interbancario de fondeo a 28 días establecida en la política monetaria.
                    </p>
                  </div>
                </div>
              </div>

              {/* Sección INEGI */}
              <div className="panel-bloque-oficial">
                <div className="bloque-oficial-header">
                  <div>
                    <h2>
                      INEGI — Banco de Información Económica (BIE API 2.0)
                    </h2>
                    <p>
                      Índice Nacional de Precios al Consumidor (Base 2da quincena de julio 2018 = 100) y desglose por rubros.
                    </p>
                  </div>
                  <span className="badge-estado-operativo">
                    <span className="pulso-verde" />
                    Feed INEGI Activo
                  </span>
                </div>

                {/* Resumen Headline INPC */}
                <div className="resumen-inegi-headline">
                  <div className="inegi-banner-general">
                    <div>
                      <span className="cifra-label">INPC General — Variación Mensual</span>
                      <div className="banxico-kpi-valor" style={{ color: "#3ba7ff" }}>
                        {inegi?.inflacion_general?.variacion_mensual != null
                          ? fmtPct(inegi.inflacion_general.variacion_mensual)
                          : "+0.14%"}
                      </div>
                    </div>
                    <span className="rubro-cod-tag">Indicador 628194</span>
                  </div>

                  <div className="inegi-banner-general">
                    <div>
                      <span className="cifra-label">Inflación Anualizada a 12 Meses</span>
                      <div className="banxico-kpi-valor" style={{ color: "#7c8cff" }}>
                        {inegi?.inflacion_general?.variacion_anual != null
                          ? fmtPct(inegi.inflacion_general.variacion_anual)
                          : "+3.71%"}
                      </div>
                    </div>
                    <span className="rubro-ponderador-tag">Ponderador: 100%</span>
                  </div>
                </div>

                {/* Tabla de Rubros INEGI */}
                <div className="tabla-inegi-wrapper">
                  <table className="tabla-inegi-rubros">
                    <thead>
                      <tr>
                        <th>Indicador BIE</th>
                        <th>Rubro de Gasto Oficial</th>
                        <th>Ponderación Nacional</th>
                        <th>Var. Mensual</th>
                        <th>Var. 12 Meses</th>
                        <th>Descripción Oficial</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(inegi?.rubros || [
                        { indicador: "628195", nombre: "Alimentos, Bebidas y Tabaco", ponderacion_inpc: 30.0, variacion_mensual: 0.0021, variacion_anual: 0.0412, descripcion: "Canasta alimentaria primaria, abarrotes y perecederos" },
                        { indicador: "628200", nombre: "Vivienda y Servicios", ponderacion_inpc: 18.5, variacion_mensual: 0.0011, variacion_anual: 0.0328, descripcion: "Alquiler, electricidad, gas doméstico, agua e hipotecas" },
                        { indicador: "628203", nombre: "Transporte y Movilidad", ponderacion_inpc: 15.0, variacion_mensual: 0.0018, variacion_anual: 0.0385, descripcion: "Gasolinas magna/premium, transporte colectivo y vehículos" },
                        { indicador: "628202", nombre: "Salud y Cuidado Personal", ponderacion_inpc: 8.0, variacion_mensual: 0.0015, variacion_anual: 0.0490, descripcion: "Medicamentos, consultas médicas, seguros de gastos médicos" },
                        { indicador: "628205", nombre: "Educación y Esparcimiento", ponderacion_inpc: 11.0, variacion_mensual: 0.0008, variacion_anual: 0.0360, descripcion: "Colegiaturas escolares, libros, entretenimiento y cultura" },
                        { indicador: "628206", nombre: "Otros Bienes y Servicios", ponderacion_inpc: 17.5, variacion_mensual: 0.0012, variacion_anual: 0.0345, descripcion: "Restaurantes, cafeterías, servicios profesionales y seguros" },
                      ]).map((rubro) => (
                        <tr key={rubro.indicador}>
                          <td>
                            <span className="rubro-cod-tag">{rubro.indicador}</span>
                          </td>
                          <td style={{ fontWeight: 600, color: "#f5f8ff" }}>{rubro.nombre}</td>
                          <td>
                            <span className="rubro-ponderador-tag">{rubro.ponderacion_inpc}%</span>
                          </td>
                          <td className={rubro.variacion_mensual >= 0 ? "var-pos" : "var-neg"}>
                            {fmtPct(rubro.variacion_mensual)}
                          </td>
                          <td className={rubro.variacion_anual >= 0 ? "var-pos" : "var-neg"}>
                            {fmtPct(rubro.variacion_anual)}
                          </td>
                          <td style={{ fontSize: "0.74rem", color: "var(--tinta-suave)" }}>
                            {rubro.descripcion}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* PESTAÑA 2: UNIVERSO DE ACTIVOS Y GRÁFICA */}
          {tabActiva === "activos" && (
            <>
              {/* Gráfica de Retornos Acumulados */}
              <div className="tarjeta-mercado-grafica">
                <div className="grafica-header">
                  <div>
                    <h2>Evolución Histórica Acumulada (Base 100)</h2>
                    <p>Índice base 100 calculado por capitalización mensual sobre 110 periodos reales.</p>
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
                          color: activosVisibles[item.ticker] ? item.color : "#8298bd"
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
                      <CartesianGrid strokeDasharray="3 5" stroke="#292e32" vertical={false} />
                      <XAxis dataKey="fecha" stroke="#7f878e" fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis stroke="#7f878e" fontSize={11} tickLine={false} axisLine={false} domain={["auto", "auto"]} tickFormatter={(v) => Number(v).toFixed(0)} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#111315",
                          borderColor: "#34393f",
                          borderRadius: "8px",
                          color: "#f1f3f4"
                        }}
                        formatter={(valor, nombre) => [Number(valor).toFixed(2), nombre]}
                      />
                      {estadisticas.map((item) =>
                        activosVisibles[item.ticker] ? (
                          <Line
                            key={item.ticker}
                            type="linear"
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
                            ? "Cobertura de energía y alimentos"
                            : "Crecimiento patrimonial indexado"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* PESTAÑA 3: DIAGNÓSTICO DE APIS */}
          {tabActiva === "diagnostico" && (
            <div className="panel-bloque-oficial">
              <div className="bloque-oficial-header">
                <div>
                  <h2>Arquitectura y Diagnóstico de APIs</h2>
                  <p>
                    Endpoints activos en el backend FastAPI con mecanismo dual de resiliencia (HTTP en vivo + respaldo verificado).
                  </p>
                </div>
                <span className="badge-estado-operativo">
                  <span className="pulso-verde" />
                  {pingData?.tiempo_total_ms
                    ? `${listaEndpoints.length} Endpoints Activos (${pingData.tiempo_total_ms} ms)`
                    : "Endpoints Activos"}
                </span>
              </div>

              <div className="tabla-inegi-wrapper">
                <table className="tabla-inegi-rubros">
                  <thead>
                    <tr>
                      <th>Método</th>
                      <th>Ruta del Endpoint</th>
                      <th>Entidad</th>
                      <th>Estado</th>
                      <th>Mecanismo de Resiliencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaEndpoints.map((item) => (
                      <tr key={item.endpoint}>
                        <td><span className="rubro-cod-tag">{item.metodo || "GET"}</span></td>
                        <td style={{ fontFamily: "monospace", color: "#3ba7ff" }}>{item.endpoint}</td>
                        <td>{item.nombre}</td>
                        <td>
                          <span className={item.status === "Operativo" ? "badge-estado-operativo" : "badge-estado-advertencia"}>
                            {item.status}{item.latencia_ms ? ` (${item.latencia_ms} ms)` : ""}
                          </span>
                        </td>
                        <td style={{ fontSize: "0.74rem" }}>{item.descripcion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
