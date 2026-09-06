/**
 * Registro de pantallas de producto.
 *
 * `App.jsx` importa `RUTAS_PRODUCTO`, pinta la navegación y monta la vista
 * activa. Añadir una pantalla es añadir una entrada aquí.
 *
 * Forma de cada ruta:
 *   id        string   único, identifica la vista
 *   etiqueta  string   lo que se lee en la navegación
 *   grupo     "analisis" | "cuenta" | "oculta"
 *   privada   boolean  true = exige sesión iniciada
 *   render    (ctx) => JSX
 *
 * `ctx`: { datos, setDatos, pesos, setPesos, horizonte, buffer, irA }
 */

import Acceso from "./views/Acceso.jsx";
import Comparar from "./views/Comparar.jsx";
import Cuenta from "./views/Cuenta.jsx";
import Historial from "./views/Historial.jsx";

export const RUTAS_PRODUCTO = [
  {
    id: "acceso",
    etiqueta: "Entrar",
    grupo: "oculta",
    privada: false,
    render: (ctx) => <Acceso onListo={() => ctx.irA("onboarding")} />,
  },
  {
    id: "historial",
    etiqueta: "Historial",
    grupo: "cuenta",
    privada: true,
    render: (ctx) => (
      <Historial
        onAbrir={(guardado) => {
          // El registro guardado trae los tres jsonb con la misma forma que
          // devuelve el motor, así que el dashboard lo consume sin traducir.
          ctx.setPesos(guardado.pesos);
          ctx.setDatos({
            pesos: guardado.pesos,
            inflacion: guardado.inflacion,
            optimo: guardado.optimo,
            riesgo: guardado.riesgo,
          });
          ctx.irA("inflacion");
        }}
      />
    ),
  },
  {
    id: "comparar",
    etiqueta: "Comparar",
    grupo: "cuenta",
    privada: true,
    render: () => <Comparar />,
  },
  {
    id: "cuenta",
    etiqueta: "Cuenta",
    grupo: "cuenta",
    privada: true,
    render: () => <Cuenta />,
  },
];
