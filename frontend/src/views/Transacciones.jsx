import React, { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip
} from "recharts";
import { parseStatement } from "../api/client.js";
import { fmtPct } from "../formato.js";
import { ETIQUETAS_RUBRO, RUBROS } from "../rubros.js";
import Dropzone from "../components/Dropzone.jsx";
import { IconoSubir, IconoInflacion, IconoPortafolio } from "../components/Iconos.jsx";

const COLORES_RUBROS = {
  alimentos: "#f43f5e",
  vivienda: "#38bdf8",
  transporte: "#a855f7",
  salud: "#10b981",
  educacion: "#f59e0b",
  otros: "#64748b"
};

// Datos demo de transacciones extraídas para cuando no se sube un PDF
const TRANSACCIONES_DEMO = [
  { fecha: "2026-02-02", concepto: "WALMART SUPERCENTER CDMX", monto: 2450.50, rubro: "alimentos" },
  { fecha: "2026-02-03", concepto: "CFE SUMINISTRADOR BASICO", monto: 1120.00, rubro: "vivienda" },
  { fecha: "2026-02-05", concepto: "GASOLINERA G500 INSURGENTES", monto: 980.00, rubro: "transporte" },
  { fecha: "2026-02-08", concepto: "FARMACIAS DEL AHORRO", monto: 640.00, rubro: "salud" },
  { fecha: "2026-02-10", concepto: "COLEGIATURA INSTITUTO MEXICO", monto: 4500.00, rubro: "educacion" },
  { fecha: "2026-02-12", concepto: "COSTCO WHOLESALE POLANCO", monto: 3890.20, rubro: "alimentos" },
  { fecha: "2026-02-15", concepto: "PAGO MANTENIMIENTO EDIFICIO", monto: 1800.00, rubro: "vivienda" },
  { fecha: "2026-02-18", concepto: "UBER TRIP MEXICO DF", monto: 340.00, rubro: "transporte" },
  { fecha: "2026-02-21", concepto: "CONSULTA MEDICA PEDIATRICA", monto: 1200.00, rubro: "salud" },
  { fecha: "2026-02-25", concepto: "NETFLIX & SPOTIFY SUSCRIPCION", monto: 429.00, rubro: "otros" }
];

export default function Transacciones({ onCanastaActualizada, onIr }) {
  const [emisor, setEmisor] = useState("BBVA México");
  const [transacciones, setTransacciones] = useState(TRANSACCIONES_DEMO);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  const procesarPdf = async (archivo) => {
    setCargando(true);
    setError(null);
    try {
      const res = await parseStatement(archivo);
      setEmisor(res.emisor || "GENERICO");
      if (res.transacciones && res.transacciones.length > 0) {
        setTransacciones(res.transacciones);
      }
      if (res.pesos) {
        onCanastaActualizada?.(res.pesos);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  // Filtrado de transacciones
  const transaccionesFiltradas = transacciones.filter(t =>
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
          <span className="pill-badge pill-esmeralda">Parser PDF cvxpy</span>
        </div>
        <p className="seccion-bajada">
          El backend parsea estados bancarios mexicanos (BBVA, Santander, Banorte, Citibanamex), clasifica cada gasto en los 6 rubros del INPC y computa tu vector de pasivos.
        </p>
      </div>

      <div className="grid-transacciones-top">
        {/* Zona de Carga PDF */}
        <div className="tarjeta-dropzone-transacciones">
          <h2>Cargar Nuevo Estado de Cuenta</h2>
          <p>Sube tu archivo PDF emitido por tu banco. El texto se procesa localmente en el motor sin almacenar datos sensibles.</p>
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

      {/* Tabla Detallada de Transacciones Extraídas */}
      <div className="panel panel-tabla-transacciones">
        <div className="tabla-header-con-busqueda">
          <div>
            <h2>Movimientos Bancarios Clasificados ({transaccionesFiltradas.length})</h2>
            <p>Cada renglón fue categorizado por reglas deterministas con fallback a la canasta nacional.</p>
          </div>
          <div className="buscador-wrapper">
            <input
              type="text"
              placeholder="Buscar por comercio o rubro..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="input-busqueda"
            />
          </div>
        </div>

        <div className="tabla-responsive">
          <table className="tabla-datos">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto / Comercio</th>
                <th>Rubro INPC Asignado</th>
                <th className="text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {transaccionesFiltradas.map((t, idx) => (
                <tr key={idx}>
                  <td className="font-mono text-muted">{t.fecha}</td>
                  <td className="font-medium">{t.concepto}</td>
                  <td>
                    <span
                      className="tag-rubro-pill"
                      style={{
                        backgroundColor: `${COLORES_RUBROS[t.rubro] || "#64748b"}22`,
                        color: COLORES_RUBROS[t.rubro] || "#f8fafc",
                        borderColor: `${COLORES_RUBROS[t.rubro] || "#64748b"}55`
                      }}
                    >
                      {ETIQUETAS_RUBRO[t.rubro] || t.rubro}
                    </span>
                  </td>
                  <td className="text-right font-mono font-semibold">
                    ${t.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
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
