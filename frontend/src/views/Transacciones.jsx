import React, { useState, useEffect } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip
} from "recharts";
import { parseStatement, getStatementInsights } from "../api/client.js";
import { fmtPct } from "../formato.js";
import { ETIQUETAS_RUBRO, RUBROS } from "../rubros.js";
import Dropzone from "../components/Dropzone.jsx";
import { IconoSubir, IconoPortafolio } from "../components/Iconos.jsx";
import { subirEstadoCuenta } from "../datos/estados.js";
import {
  listarTransacciones,
  guardarTransacciones,
  crearTransaccionManual,
  eliminarTransaccion,
} from "../datos/transacciones.js";
import { useSesion } from "../auth/SesionProvider.jsx";
import { useLanguage } from "../i18n/LanguageContext.jsx";

const COLORES_RUBROS = {
  alimentos: "#d66a6a",
  vivienda: "#f8cc1b",
  transporte: "#9da4aa",
  salud: "#4ade80",
  educacion: "#d5b84b",
  otros: "#747c83"
};

export default function Transacciones({ onCanastaActualizada, onIr }) {
  const { sesion } = useSesion();
  const { esIngles } = useLanguage();

  const [emisor, setEmisor] = useState("ESTADO BANCARIO");
  const [transacciones, setTransacciones] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [mensajeExito, setMensajeExito] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [mostrandoFormulario, setMostrandoFormulario] = useState(false);
  const [usarMiniMaxAI, setUsarMiniMaxAI] = useState(true);
  const [insights, setInsights] = useState(null);
  const [cargandoInsights, setCargandoInsights] = useState(false);

  // Formulario nuevo movimiento
  const [nuevoConcepto, setNuevoConcepto] = useState("");
  const [nuevoMonto, setNuevoMonto] = useState("");
  const [nuevoRubro, setNuevoRubro] = useState("alimentos");
  const [nuevaFecha, setNuevaFecha] = useState(new Date().toISOString().slice(0, 10));

  // Cargar transacciones reales persistidas en Supabase
  useEffect(() => {
    if (!sesion) return;
    setCargando(true);
    listarTransacciones()
      .then((filas) => {
        if (filas && filas.length > 0) {
          setTransacciones(filas);
          // Calcular y propagar canasta real del usuario
          const sumas = {};
          let total = 0;
          filas.forEach((f) => {
            const r = (f.rubro || "otros").toLowerCase();
            const m = Number(f.monto) || 0;
            sumas[r] = (sumas[r] || 0) + m;
            total += m;
          });
          if (total > 0) {
            const pesosCalc = {};
            RUBROS.forEach((r) => {
              pesosCalc[r] = Number(((sumas[r] || 0) / total).toFixed(4));
            });
            onCanastaActualizada?.(pesosCalc);
          }
        }
      })
      .catch((err) => {
        console.warn("No se pudieron cargar las transacciones:", err);
      })
      .finally(() => setCargando(false));
  }, [sesion]);

  // Cargar insights de transacciones automáticamente
  useEffect(() => {
    if (transacciones && transacciones.length > 0) {
      setCargandoInsights(true);
      const txsPayload = transacciones.map((t) => ({
        fecha: t.fecha || "",
        descripcion: t.concepto || t.descripcion || "",
        monto: Number(t.monto) || 0,
        rubro: t.rubro || "otros",
      }));
      getStatementInsights(txsPayload, 120.0)
        .then((res) => setInsights(res))
        .catch((err) => console.warn("Error cargando insights:", err))
        .finally(() => setCargandoInsights(false));
    } else {
      setInsights(null);
    }
  }, [transacciones]);

  const procesarPdf = async (archivo) => {
    setCargando(true);
    setError(null);
    setMensajeExito(null);
    try {
      const res = await parseStatement(archivo, usarMiniMaxAI);
      setEmisor(res.emisor || "ESTADO BANCARIO");
      if (res.transacciones && res.transacciones.length > 0) {
        setTransacciones(res.transacciones);
      }
      if (res.pesos) {
        onCanastaActualizada?.(res.pesos);
      }
      const motorNombre = usarMiniMaxAI ? "Motor Analítico Avanzado" : "Motor Local Directo";
      setMensajeExito(`¡Estado de cuenta procesado con ${motorNombre}! Se extrajeron ${res.transacciones?.length || 0} movimientos con éxito.`);

      // Persistencia en Supabase: Subir PDF y guardar transacciones en transacciones_bancarias
      if (sesion) {
        subirEstadoCuenta(archivo, res.emisor || "BANCO")
          .then(async (estado) => {
            if (res.transacciones && res.transacciones.length > 0) {
              const guardadas = await guardarTransacciones(res.transacciones, estado?.id);
              if (guardadas?.length > 0) {
                setTransacciones(guardadas);
              }
            }
            setMensajeExito((prev) => `${prev} Transacciones guardadas en tu bóveda segura de Supabase.`);
          })
          .catch((e) => {
            console.warn("No se pudieron guardar las transacciones en Supabase:", e.message);
          });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
      setTimeout(() => setMensajeExito(null), 7000);
    }
  };

  const handleAgregarMovimiento = async (e) => {
    e.preventDefault();
    const montoNum = parseFloat(nuevoMonto);
    if (!nuevoConcepto.trim() || isNaN(montoNum) || montoNum <= 0) return;

    const item = {
      fecha: nuevaFecha || new Date().toISOString().slice(0, 10),
      concepto: nuevoConcepto.trim().toUpperCase(),
      monto: montoNum,
      rubro: nuevoRubro,
    };

    if (sesion) {
      try {
        const guardado = await crearTransaccionManual(item);
        setTransacciones((prev) => [guardado || item, ...prev]);
      } catch {
        setTransacciones((prev) => [item, ...prev]);
      }
    } else {
      setTransacciones((prev) => [item, ...prev]);
    }

    setNuevoConcepto("");
    setNuevoMonto("");
    setMostrandoFormulario(false);
  };

  const handleCambiarRubro = (indexOriginal, nuevoRubroValor) => {
    setTransacciones((prev) => {
      const copia = [...prev];
      copia[indexOriginal] = { ...copia[indexOriginal], rubro: nuevoRubroValor };
      return copia;
    });
  };

  const handleEliminarTransaccion = async (indexOriginal) => {
    const item = transacciones[indexOriginal];
    if (item?.id && sesion) {
      try {
        await eliminarTransaccion(item.id);
      } catch (e) {
        console.warn("Error eliminando transacción de Supabase:", e.message);
      }
    }
    setTransacciones((prev) => prev.filter((_, idx) => idx !== indexOriginal));
  };

  // Filtrado de transacciones
  const transaccionesFiltradas = transacciones.map((t, originalIdx) => ({ ...t, originalIdx })).filter(t =>
    t.concepto.toLowerCase().includes(busqueda.toLowerCase()) ||
    t.rubro.toLowerCase().includes(busqueda.toLowerCase())
  );

  const totalGastos = transacciones.reduce((acc, t) => acc + t.monto, 0);

  // Calcular pesos agregados por rubro
  const datosPie = RUBROS.map(r => {
    const suma = transacciones.filter(t => t.rubro === r).reduce((acc, t) => acc + t.monto, 0);
    return {
      name: ETIQUETAS_RUBRO[r] || r,
      rubro: r,
      value: Number(suma.toFixed(2)),
      pct: totalGastos > 0 ? suma / totalGastos : 0
    };
  }).filter(d => d.value > 0);

  const aplicarCanastaAlOptimizador = () => {
    const nuevosPesos = {};
    RUBROS.forEach(r => {
      const suma = transacciones.filter(t => t.rubro === r).reduce((acc, t) => acc + t.monto, 0);
      nuevosPesos[r] = totalGastos > 0 ? Number((suma / totalGastos).toFixed(4)) : 0.166;
    });
    onCanastaActualizada?.(nuevosPesos);
    onIr?.("cobertura");
  };

  return (
    <div className="pantalla-transacciones">
      <div className="seccion-encabezado">
        <div className="titulo-con-badge">
          <h1>Extractor de Estados de Cuenta y Canasta Real</h1>
          <span className="pill-badge pill-esmeralda">Lector PDF Automatizado</span>
        </div>
        <p className="seccion-bajada">
          El motor procesa y clasifica estados bancarios mexicanos (BBVA, Santander, Banorte, Citibanamex), asignando cada movimiento a los 6 rubros del INPC para calcular tu vector real de pasivos.
        </p>
      </div>

      <div className="grid-transacciones-top">
        {/* Zona de Carga PDF */}
        <div className="tarjeta-dropzone-transacciones">
          <h2>Cargar Nuevo Estado de Cuenta</h2>
          <p>Sube tu archivo PDF emitido por tu banco. El texto se procesa con inteligencia de datos sin almacenar información sensible.</p>

          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            margin: "12px 0 16px",
            padding: "10px 14px",
            background: usarMiniMaxAI ? "rgba(14, 165, 233, 0.12)" : "rgba(255, 255, 255, 0.04)",
            border: `1px solid ${usarMiniMaxAI ? "rgba(14, 165, 233, 0.35)" : "rgba(255, 255, 255, 0.1)"}`,
            borderRadius: "10px",
            gap: "10px"
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.85rem", color: usarMiniMaxAI ? "#38bdf8" : "#94a3b8", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>{usarMiniMaxAI ? "Motor Analítico Avanzado" : "Motor Local Directo"}</span>
                {usarMiniMaxAI && <span className="pill-badge pill-azul" style={{ fontSize: "0.65rem", padding: "2px 6px" }}>Modo Avanzado</span>}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "2px" }}>
                {usarMiniMaxAI ? "Procesamiento analítico profundo para clasificación contextual y lectura de estados complejos" : "Extracción de alta velocidad offline basada en reglas deterministas"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setUsarMiniMaxAI(!usarMiniMaxAI)}
              style={{
                padding: "5px 12px",
                borderRadius: "20px",
                border: "none",
                background: usarMiniMaxAI ? "#0ea5e9" : "#334155",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.75rem",
                whiteSpace: "nowrap"
              }}
            >
              {usarMiniMaxAI ? "Modo Local" : "Modo Avanzado"}
            </button>
          </div>

          <Dropzone onArchivo={procesarPdf} ocupado={cargando} error={error} />
        </div>

        {/* Resumen del Emisor y Desglose por Rubros */}
        <div className="tarjeta-emisor-resumen">
          <div className="emisor-banner">
            <div className="emisor-info">
              <span className="emisor-etiqueta">Institución Detectada:</span>
              <h3 className="emisor-nombre">{emisor}</h3>
            </div>
            <div className="emisor-total">
              <span className="total-label">Total Extraído:</span>
              <span className="total-cifra">${totalGastos.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN</span>
            </div>
          </div>

          <div className="grafica-pie-wrapper">
            <div className="pie-container">
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie
                    data={datosPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                  >
                    {datosPie.map((entry) => (
                      <Cell key={entry.rubro} fill={COLORES_RUBROS[entry.rubro] || "#94a3b8"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#131722",
                      borderColor: "rgba(255,255,255,0.15)",
                      borderRadius: "10px",
                      color: "#f8fafc"
                    }}
                    formatter={(v) => [`$${v.toLocaleString("es-MX")} MXN`, "Gasto"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="pie-leyendas-grid">
              {datosPie.map(d => (
                <div key={d.rubro} className="pie-leyenda-fila">
                  <span className="dot" style={{ backgroundColor: COLORES_RUBROS[d.rubro] }} />
                  <span className="leyenda-nombre">{d.name}:</span>
                  <span className="leyenda-pct">{fmtPct(d.pct)}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="btn-accion-principal-full"
            onClick={aplicarCanastaAlOptimizador}
          >
            <IconoPortafolio size={18} /> Optimizar Portafolio con esta Canasta →
          </button>
        </div>
      </div>

      {mensajeExito && (
        <div style={{
          padding: "12px 18px",
          background: "rgba(16, 185, 129, 0.15)",
          border: "1px solid rgba(16, 185, 129, 0.4)",
          borderRadius: "8px",
          color: "#10b981",
          fontSize: "0.9rem",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "1.25rem"
        }}>
          <span>•</span> {mensajeExito}
        </div>
      )}

      {/* Panel de Auditoría de Gastos Hormiga y Suscripciones */}
      {insights && (
        <div className="panel panel-insights-gastos" style={{
          background: "linear-gradient(135deg, rgba(15, 23, 42, 0.85), rgba(30, 41, 59, 0.65))",
          border: "1px solid rgba(56, 189, 248, 0.25)",
          borderRadius: "14px",
          padding: "1.25rem 1.5rem",
          marginBottom: "1.5rem"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h2 style={{ fontSize: "1.15rem", margin: 0, color: "#f8fafc" }}>Diagnóstico de Fugas y Gastos Hormiga</h2>
                <span className="pill-badge pill-amarillo" style={{ fontSize: "0.7rem" }}>Auditoría Financiera</span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "#94a3b8" }}>
                {insights.diagnostico_fugas}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8", display: "block" }}>Ahorro Potencial Mensual:</span>
              <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "#10b981" }}>
                +${insights.ahorro_potencial_mensual.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN/mes
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
            <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px 14px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Gastos Hormiga Totales (&lt;$120 MXN)</span>
              <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "#f43f5e", marginTop: "4px" }}>
                ${insights.gastos_hormiga_total.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN
                <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "#94a3b8", marginLeft: "6px" }}>
                  ({(insights.gastos_hormiga_porcentaje * 100).toFixed(1)}% de egresos)
                </span>
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px 14px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Suscripciones Recurrentes Detectadas</span>
              <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "#38bdf8", marginTop: "4px" }}>
                {insights.suscripciones?.length || 0} servicios activos
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px 14px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Tasa de Ahorro / Superávit Estimado</span>
              <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "#10b981", marginTop: "4px" }}>
                {(insights.tasa_ahorro_estimada_pct * 100).toFixed(1)}% mensual
              </div>
            </div>
          </div>

          {/* Desglose de suscripciones y top comercios */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
            {insights.suscripciones?.length > 0 && (
              <div style={{ background: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "10px" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#cbd5e1", display: "block", marginBottom: "8px" }}>
                  Suscripciones e Insumos Fijos Detectados:
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {insights.suscripciones.map((s, idx) => (
                    <span key={idx} style={{
                      fontSize: "0.75rem",
                      padding: "4px 8px",
                      background: "rgba(56, 189, 248, 0.15)",
                      border: "1px solid rgba(56, 189, 248, 0.3)",
                      borderRadius: "6px",
                      color: "#e2e8f0"
                    }}>
                      {s.servicio}: <strong>${s.monto_estimado.toLocaleString("es-MX")} MXN</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {insights.top_comercios?.length > 0 && (
              <div style={{ background: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "10px" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#cbd5e1", display: "block", marginBottom: "8px" }}>
                  Top Comercios con Mayor Gasto:
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {insights.top_comercios.slice(0, 3).map((c, idx) => (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "#94a3b8" }}>
                      <span>{c.comercio}</span>
                      <strong style={{ color: "#f8fafc" }}>${c.monto_total.toLocaleString("es-MX")} MXN ({(c.participacion_pct * 100).toFixed(1)}%)</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabla Detallada de Transacciones Extraídas */}
      <div className="panel panel-tabla-transacciones">
        <div className="tabla-header-con-busqueda" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2>Movimientos Bancarios Clasificados ({transaccionesFiltradas.length})</h2>
            <p>Cada movimiento fue categorizado mediante reglas deterministas calibradas con la canasta del INEGI.</p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <div className="buscador-wrapper">
              <input
                type="text"
                placeholder="Buscar por comercio o rubro..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="input-busqueda"
              />
            </div>
            <button
              type="button"
              className="boton-primario"
              style={{ fontSize: "0.82rem", padding: "6px 12px" }}
              onClick={() => setMostrandoFormulario((v) => !v)}
            >
              {mostrandoFormulario ? "Cerrar" : "+ Agregar Movimiento"}
            </button>
          </div>
        </div>

        {mostrandoFormulario && (
          <form
            onSubmit={handleAgregarMovimiento}
            style={{
              marginTop: "14px",
              padding: "14px 18px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              borderRadius: "8px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr)) auto",
              gap: "10px",
              alignItems: "end"
            }}
          >
            <div>
              <label style={{ fontSize: "0.75rem", color: "var(--color-texto-apagado)", display: "block", marginBottom: "4px" }}>Concepto / Comercio</label>
              <input
                type="text"
                required
                placeholder="Ej. Chedraui Selecto"
                value={nuevoConcepto}
                onChange={(e) => setNuevoConcepto(e.target.value)}
                style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", color: "var(--color-texto-apagado)", display: "block", marginBottom: "4px" }}>Monto (MXN)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="Ej. 1850.00"
                value={nuevoMonto}
                onChange={(e) => setNuevoMonto(e.target.value)}
                style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", color: "var(--color-texto-apagado)", display: "block", marginBottom: "4px" }}>Rubro INPC</label>
              <select
                value={nuevoRubro}
                onChange={(e) => setNuevoRubro(e.target.value)}
                style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
              >
                {RUBROS.map((r) => (
                  <option key={r} value={r}>{ETIQUETAS_RUBRO[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", color: "var(--color-texto-apagado)", display: "block", marginBottom: "4px" }}>Fecha</label>
              <input
                type="date"
                value={nuevaFecha}
                onChange={(e) => setNuevaFecha(e.target.value)}
                style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
              />
            </div>
            <button
              type="submit"
              className="boton-primario"
              style={{ padding: "7px 16px" }}
            >
              + Guardar
            </button>
          </form>
        )}

        <div className="tabla-responsive">
          <table className="tabla-datos">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto / Comercio</th>
                <th>Rubro INPC (Reclasificar)</th>
                <th className="text-right">Monto</th>
                <th style={{ textAlign: "center", width: "50px" }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {transaccionesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--color-texto-apagado)" }}>
                    {cargando
                      ? "Consultando movimientos en tu bóveda segura de Supabase…"
                      : "No hay transacciones registradas. Sube un estado de cuenta PDF o agrega un movimiento manualmente con el botón superior."}
                  </td>
                </tr>
              ) : (
                transaccionesFiltradas.map((t) => (
                  <tr key={`${t.originalIdx}-${t.fecha}-${t.concepto}`}>
                    <td className="font-mono text-muted">{t.fecha}</td>
                    <td className="font-medium">{t.concepto}</td>
                    <td>
                      <select
                        value={t.rubro}
                        onChange={(e) => handleCambiarRubro(t.originalIdx, e.target.value)}
                        style={{
                          padding: "3px 8px",
                          borderRadius: "14px",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          backgroundColor: `${COLORES_RUBROS[t.rubro] || "#64748b"}22`,
                          color: COLORES_RUBROS[t.rubro] || "#f8fafc",
                          border: `1px solid ${COLORES_RUBROS[t.rubro] || "#64748b"}55`,
                          cursor: "pointer"
                        }}
                        title="Haz clic para reasignar rubro"
                      >
                        {RUBROS.map((r) => (
                          <option key={r} value={r} style={{ background: "#0f172a", color: "#fff" }}>
                            {ETIQUETAS_RUBRO[r] || r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-right font-mono font-semibold">
                      ${t.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => handleEliminarTransaccion(t.originalIdx)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--color-texto-apagado)",
                          cursor: "pointer",
                          fontSize: "0.95rem",
                          padding: "2px 6px",
                          borderRadius: "4px"
                        }}
                        title="Eliminar movimiento"
                        onMouseEnter={(e) => e.target.style.color = "#ef4444"}
                        onMouseLeave={(e) => e.target.style.color = "var(--color-texto-apagado)"}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
