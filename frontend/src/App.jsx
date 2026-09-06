import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calcularTodo,
  esperarBackend,
  optimizar,
  parseStatement,
  simular,
} from "./api/client.js";
import { calcularAlertas, guardarRevision, leerRevision } from "./alertas.js";
import { SesionProvider, useSesion } from "./auth/SesionProvider.jsx";
import { guardarAnalisis } from "./datos/analisis.js";
import demoData from "./data/demoData.json";
import { RUTAS_PRODUCTO } from "./rutas-producto.jsx";
import Alertas from "./views/Alertas.jsx";
import Cobertura from "./views/Cobertura.jsx";
import Inflacion from "./views/Inflacion.jsx";
import Onboarding from "./views/Onboarding.jsx";
import Reporte from "./views/Reporte.jsx";
import Riesgo from "./views/Riesgo.jsx";

/**
 * Rutas del núcleo analítico. Las pantallas de producto (acceso, historial,
 * comparar, cuenta) las registra el Agente C en `rutas-producto.jsx` y se
 * fusionan aquí abajo, para que nadie más tenga que editar este archivo.
 */
const RUTAS_BASE = [
  { id: "onboarding", etiqueta: "Onboarding", grupo: "oculta", privada: false },
  { id: "inflacion", etiqueta: "Tu inflación", grupo: "analisis", privada: false },
  { id: "cobertura", etiqueta: "Cobertura", grupo: "analisis", privada: false },
  { id: "riesgo", etiqueta: "Riesgo", grupo: "analisis", privada: false },
  { id: "alertas", etiqueta: "Alertas", grupo: "oculta", privada: false },
  { id: "reporte", etiqueta: "Reporte", grupo: "oculta", privada: false },
];

const RUTAS = [...RUTAS_BASE, ...RUTAS_PRODUCTO];

/**
 * Rutas visibles en la navegación.
 *
 * Sin Supabase configurado se ocultan las privadas: mostrar Historial,
 * Comparar y Cuenta para que las tres digan "inicia sesión" es ofrecer algo
 * que no existe.
 */
const porGrupo = (grupo, hayCuentas) =>
  RUTAS.filter(
    (ruta) => ruta.grupo === grupo && (hayCuentas || !ruta.privada)
  );

export default function App() {
  return (
    <SesionProvider>
      <Aplicacion />
    </SesionProvider>
  );
}

function Aplicacion() {
  const { hayCuentas, cargando: cargandoSesion, sesion } = useSesion();
  const [guardando, setGuardando] = useState(false);
  const [avisoGuardado, setAvisoGuardado] = useState(null);

  const [backendListo, setBackendListo] = useState(false);
  const [pesos, setPesos] = useState(demoData.pesos);
  const [datos, setDatos] = useState(demoData);
  const [vista, setVista] = useState("onboarding");
  const [horizonte, setHorizonte] = useState(12);
  const [buffer, setBuffer] = useState(0.1);

  const [ocupadoFlujo, setOcupadoFlujo] = useState(false);
  const [errorPdf, setErrorPdf] = useState(null);
  const [recalculandoCobertura, setRecalculandoCobertura] = useState(false);
  const [errorCobertura, setErrorCobertura] = useState(null);
  const [recalculandoRiesgo, setRecalculandoRiesgo] = useState(false);
  const [errorRiesgo, setErrorRiesgo] = useState(null);
  const [recalculandoCanasta, setRecalculandoCanasta] = useState(false);
  const [errorCanasta, setErrorCanasta] = useState(null);
  const [revision, setRevision] = useState(leerRevision);

  const alertas = useMemo(() => calcularAlertas(datos, revision), [datos, revision]);
  const alertasActivas = alertas.filter((alerta) => alerta.severidad !== "info").length;

  useEffect(() => {
    esperarBackend().then(setBackendListo);
  }, []);

  const usarPdf = async (archivo) => {
    setOcupadoFlujo(true);
    setErrorPdf(null);
    try {
      const parsed = await parseStatement(archivo);
      setPesos(parsed.pesos);
      setDatos(await calcularTodo(parsed.pesos, buffer, horizonte));
      setVista("inflacion");
    } catch (error) {
      setErrorPdf(error.message);
    } finally {
      setOcupadoFlujo(false);
    }
  };

  const usarDemo = async () => {
    setOcupadoFlujo(true);
    setErrorPdf(null);
    try {
      setPesos(demoData.pesos);
      setDatos(await calcularTodo(demoData.pesos, buffer, horizonte));
    } catch {
      // Sin backend, el escenario empaquetado mantiene la demo en pie.
      setDatos(demoData);
    } finally {
      setOcupadoFlujo(false);
      setVista("inflacion");
    }
  };

  const marcarRevisado = () => {
    const snapshot = {
      fecha: new Date().toISOString(),
      delta: datos.inflacion.delta_anualizado,
      pesos: datos.pesos,
      weights: datos.optimo.weights,
    };
    guardarRevision(snapshot);
    setRevision(snapshot);
  };

  const cambiarCanasta = async (nuevosPesos) => {
    setRecalculandoCanasta(true);
    setErrorCanasta(null);
    try {
      setPesos(nuevosPesos);
      setDatos(await calcularTodo(nuevosPesos, buffer, horizonte));
    } catch (error) {
      setErrorCanasta(error.message);
    } finally {
      setRecalculandoCanasta(false);
    }
  };

  const cambiarBuffer = useCallback(
    async (nuevoBuffer) => {
      setBuffer(nuevoBuffer);
      setRecalculandoCobertura(true);
      setErrorCobertura(null);
      try {
        // Un solo setDatos con ambos resultados. Con dos llamadas separadas
        // había un instante con el óptimo nuevo y el riesgo viejo, y
        // cambiarHorizonte lee datos.optimo.weights: tocar buffer y horizonte
        // seguido podía simular con los pesos de otra optimización.
        const optimo = await optimizar(pesos, nuevoBuffer);
        const riesgo = await simular(pesos, optimo.weights, horizonte);
        setDatos((actual) => ({ ...actual, optimo, riesgo }));
      } catch (error) {
        setErrorCobertura(error.message);
      } finally {
        setRecalculandoCobertura(false);
      }
    },
    [pesos, horizonte]
  );

  const reintentarCobertura = useCallback(() => {
    setErrorCobertura(null);
    cambiarBuffer(buffer);
  }, [cambiarBuffer, buffer]);

  const cambiarHorizonte = useCallback(
    async (nuevo) => {
      setHorizonte(nuevo);
      setRecalculandoRiesgo(true);
      setErrorRiesgo(null);
      try {
        const riesgo = await simular(pesos, datos.optimo.weights, nuevo);
        setDatos((actual) => ({ ...actual, riesgo }));
      } catch (error) {
        setErrorRiesgo(error.message);
      } finally {
        setRecalculandoRiesgo(false);
      }
    },
    [pesos, datos.optimo.weights]
  );

  const reintentarRiesgo = useCallback(() => {
    setErrorRiesgo(null);
    cambiarHorizonte(horizonte);
  }, [cambiarHorizonte, horizonte]);

  const guardar = async () => {
    setGuardando(true);
    setAvisoGuardado(null);
    try {
      // Etiqueta por defecto con el mes en curso; se renombra en Historial,
      // que es menos fricción que abrir un diálogo antes de guardar.
      const etiqueta = new Date().toLocaleDateString("es-MX", {
        month: "long",
        year: "numeric",
      });
      await guardarAnalisis({
        etiqueta: etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1),
        pesos,
        buffer,
        horizonte,
        datos,
      });
      setAvisoGuardado("Guardado en tu historial.");
    } catch (error) {
      setAvisoGuardado(error.message);
    } finally {
      setGuardando(false);
      setTimeout(() => setAvisoGuardado(null), 4000);
    }
  };

  // Contexto que reciben las pantallas del Agente C.
  const contextoProducto = useMemo(
    () => ({
      datos,
      setDatos,
      pesos,
      setPesos,
      horizonte,
      buffer,
      irA: setVista,
    }),
    [datos, pesos, horizonte, buffer]
  );

  const rutaActiva = RUTAS.find((ruta) => ruta.id === vista) ?? RUTAS_BASE[0];
  const enDashboard = vista !== "onboarding";

  // Mientras el Agente C no conecte Supabase, `hayCuentas` es false y todas
  // las rutas se tratan como públicas: así el recorrido de demo funciona sin
  // que nadie dependa de que las cuentas existan.
  const bloqueadaPorSesion = hayCuentas && rutaActiva.privada && !sesion;

  if (cargandoSesion) {
    return (
      <div className="app">
        <main className="contenido">
          <p className="cargando-sesion" role="status">
            <i className="pulso-chico" aria-hidden="true" />
            Cargando tu sesión…
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="cabecera">
        <div className="marca">
          <span className="marca-nombre">LifeHedge</span>
          <span className="marca-lema">Inversión guiada por tu pasivo</span>
        </div>
        {!backendListo ? (
          <span className="aviso-calentamiento" role="status">
            <i className="pulso-chico" aria-hidden="true" />
            Calentando el motor cuantitativo…
          </span>
        ) : null}
        {enDashboard ? (
          <nav className="pestanas" aria-label="Secciones del dashboard">
            {porGrupo("analisis", hayCuentas).map((ruta) => (
              <Pestana key={ruta.id} ruta={ruta} vista={vista} onIr={setVista} />
            ))}
            {porGrupo("cuenta", hayCuentas).map((ruta) => (
              <Pestana key={ruta.id} ruta={ruta} vista={vista} onIr={setVista} />
            ))}
            <button
              type="button"
              className="pestana cambiar-cuenta"
              onClick={() => setVista("onboarding")}
            >
              Cambiar estado de cuenta
            </button>
          </nav>
        ) : null}
        {enDashboard ? (
          <div className="acciones-cabecera">
            {hayCuentas && sesion ? (
              <button
                type="button"
                className="boton-secundario"
                onClick={guardar}
                disabled={guardando}
              >
                {guardando ? "Guardando…" : "Guardar análisis"}
              </button>
            ) : null}
            {hayCuentas && !sesion ? (
              <button
                type="button"
                className="boton-secundario"
                onClick={() => setVista("acceso")}
              >
                Entrar
              </button>
            ) : null}
            {avisoGuardado ? (
              <span className="aviso-guardado" role="status">
                {avisoGuardado}
              </span>
            ) : null}
            <button
              type="button"
              className="boton-campana"
              aria-label={
                alertasActivas > 0
                  ? `Alertas: ${alertasActivas} sin atender`
                  : "Ver alertas de rebalanceo"
              }
              onClick={() => setVista("alertas")}
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
              {alertasActivas > 0 ? (
                <span className="campana-badge" aria-hidden="true">
                  {alertasActivas}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="boton-reporte-corto"
              onClick={() => setVista("reporte")}
            >
              Reporte PDF
            </button>
          </div>
        ) : null}
      </header>

      <main className="contenido">
        {bloqueadaPorSesion ? (
          <section className="panel">
            <h2>Necesitas una cuenta</h2>
            <p>Inicia sesión para ver esta sección.</p>
          </section>
        ) : (
          <>
            {vista === "onboarding" ? (
              <Onboarding
                onPdf={usarPdf}
                onDemo={usarDemo}
                ocupado={ocupadoFlujo}
                error={errorPdf}
              />
            ) : null}
            {vista === "inflacion" ? (
              <Inflacion
                datos={datos}
                ocupadoEditor={recalculandoCanasta}
                errorEditor={errorCanasta}
                onCanasta={cambiarCanasta}
              />
            ) : null}
            {vista === "cobertura" ? (
              <Cobertura
                optimo={datos.optimo}
                onBuffer={cambiarBuffer}
                ocupado={recalculandoCobertura}
                error={errorCobertura}
                onRetry={reintentarCobertura}
              />
            ) : null}
            {vista === "riesgo" ? (
              <Riesgo
                riesgo={datos.riesgo}
                horizonte={horizonte}
                onHorizonte={cambiarHorizonte}
                ocupado={recalculandoRiesgo}
                error={errorRiesgo}
                onRetry={reintentarRiesgo}
              />
            ) : null}
            {vista === "alertas" ? (
              <Alertas
                alertas={alertas}
                revision={revision}
                onRevisar={marcarRevisado}
              />
            ) : null}
            {vista === "reporte" ? (
              <Reporte datos={datos} horizonte={horizonte} buffer={buffer} />
            ) : null}
            {RUTAS_PRODUCTO.map((ruta) =>
              vista === ruta.id ? (
                <div key={ruta.id}>{ruta.render(contextoProducto)}</div>
              ) : null
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Pestana({ ruta, vista, onIr }) {
  return (
    <button
      type="button"
      className={`pestana${vista === ruta.id ? " activa" : ""}`}
      aria-current={vista === ruta.id ? "page" : undefined}
      onClick={() => onIr(ruta.id)}
    >
      {ruta.etiqueta}
    </button>
  );
}
