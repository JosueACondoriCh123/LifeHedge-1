/**
 * Registro de pantallas de producto y análisis extendido.
 *
 * `App.jsx` importa `RUTAS_PRODUCTO`, renderiza la navegación lateral
 * y monta la vista activa.
 */

import React from "react";
import Acceso from "./views/Acceso.jsx";
import Acoplamiento from "./views/Acoplamiento.jsx";
import AsesorIA from "./views/AsesorIA.jsx";
import Comparar from "./views/Comparar.jsx";
import Cuenta from "./views/Cuenta.jsx";
import Dashboard from "./views/Dashboard.jsx";
import Frontera from "./views/Frontera.jsx";
import Historial from "./views/Historial.jsx";
import Mercado from "./views/Mercado.jsx";
import Simulador from "./views/Simulador.jsx";
import Transacciones from "./views/Transacciones.jsx";

export const RUTAS_PRODUCTO = [
  {
    id: "dashboard",
    etiqueta: "Dashboard",
    grupo: "analisis",
    icono: "dashboard",
    privada: false,
    render: (ctx) => (
      <Dashboard
        datos={ctx.datos}
        usuario={ctx.usuario}
        onIr={ctx.irA}
        onAbrirModalSubir={() => ctx.irA("transacciones")}
      />
    ),
  },
  {
    id: "asesoria",
    etiqueta: "Asesor IA",
    grupo: "analisis",
    icono: "asesoria",
    privada: false,
    render: (ctx) => <AsesorIA datos={ctx.datos} onIr={ctx.irA} />,
  },
  {
    id: "frontera",
    etiqueta: "Frontera & Rebalanceo",
    grupo: "analisis",
    icono: "frontera",
    privada: false,
    render: (ctx) => <Frontera datos={ctx.datos} onIr={ctx.irA} />,
  },
  {
    id: "acoplamiento",
    etiqueta: "Acoplamiento",
    grupo: "analisis",
    icono: "acoplamiento",
    privada: false,
    render: (ctx) => <Acoplamiento datos={ctx.datos} onIr={ctx.irA} />,
  },
  {
    id: "mercado",
    etiqueta: "Mercado LDI",
    grupo: "analisis",
    icono: "mercado",
    privada: false,
    render: () => <Mercado />,
  },
  {
    id: "transacciones",
    etiqueta: "Extracto PDF",
    grupo: "analisis",
    icono: "transacciones",
    privada: false,
    render: (ctx) => (
      <Transacciones
        onCanastaActualizada={(nuevosPesos) => {
          ctx.setPesos(nuevosPesos);
        }}
        onIr={ctx.irA}
      />
    ),
  },
  {
    id: "simulador",
    etiqueta: "Estrés Macro",
    grupo: "analisis",
    icono: "simulador",
    privada: false,
    render: (ctx) => <Simulador datos={ctx.datos} onIr={ctx.irA} />,
  },
  {
    id: "historial",
    etiqueta: "Historial",
    grupo: "cuenta",
    icono: "historial",
    privada: true,
    render: (ctx) => (
      <Historial
        onAbrir={(guardado) => {
          ctx.setPesos(guardado.pesos);
          ctx.setDatos({
            pesos: guardado.pesos,
            inflacion: guardado.inflacion,
            optimo: guardado.optimo,
            riesgo: guardado.riesgo,
          });
          ctx.irA("dashboard");
        }}
      />
    ),
  },
  {
    id: "comparar",
    etiqueta: "Comparar",
    grupo: "cuenta",
    icono: "comparar",
    privada: true,
    render: () => <Comparar />,
  },
  {
    id: "cuenta",
    etiqueta: "Mi Cuenta",
    grupo: "cuenta",
    icono: "cuenta",
    privada: true,
    render: () => <Cuenta />,
  },
  {
    id: "acceso",
    etiqueta: "Entrar",
    grupo: "oculta",
    icono: "cuenta",
    privada: false,
    render: (ctx) => <Acceso onListo={() => ctx.irA("dashboard")} />,
  },
];
