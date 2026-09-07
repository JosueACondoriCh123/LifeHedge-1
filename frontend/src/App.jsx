import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calcularTodo,
  esperarBackend,
  getCarteraBase,
  optimizar,
  parseStatement,
  simular,
} from "./api/client.js";
import { calcularAlertas, guardarRevision, leerRevision } from "./alertas.js";
import { SesionProvider, useSesion } from "./auth/SesionProvider.jsx";
import { guardarAnalisis } from "./datos/analisis.js";
import demoData from "./data/demoData.json";
import { RUTAS_PRODUCTO } from "./rutas-producto.jsx";
import Acceso from "./views/Acceso.jsx";
import Alertas from "./views/Alertas.jsx";
import Cobertura from "./views/Cobertura.jsx";
import Inflacion from "./views/Inflacion.jsx";
import Landing from "./views/Landing.jsx";
import Onboarding from "./views/Onboarding.jsx";
import Reporte from "./views/Reporte.jsx";
import Riesgo from "./views/Riesgo.jsx";
import {
  IconoDashboard,
  IconoPortafolio,
  IconoInflacion,
  IconoAcoplamiento,
  IconoRiesgo,
  IconoMercado,
  IconoHistorial,
  IconoComparar,
  IconoTransacciones,
  IconoCuenta,
  IconoAlertas,
  IconoReporte,
  IconoSimulador,
  IconoSubir,
  IconoFrontera,
  IconoAsesorIA,
  IconoCandado,
} from "./components/Iconos.jsx";

const RUTAS_BASE = [
  { id: "onboarding", etiqueta: "Cargar PDF", grupo: "oculta", privada: false, icono: "subir" },
  { id: "inflacion", etiqueta: "Tu Inflación", grupo: "analisis", privada: false, icono: "inflacion" },
  { id: "cobertura", etiqueta: "Cobertura LDI", grupo: "analisis", privada: false, icono: "portafolio" },
  { id: "riesgo", etiqueta: "Simulación de Riesgo", grupo: "analisis", privada: false, icono: "riesgo" },
  { id: "alertas", etiqueta: "Alertas", grupo: "oculta", privada: false, icono: "alertas" },
  { id: "reporte", etiqueta: "Reporte PDF", grupo: "oculta", privada: false, icono: "reporte" },
];

const MAPA_ICONOS = {
  dashboard: IconoDashboard,
  asesoria: IconoAsesorIA,
  frontera: IconoFrontera,
  inflacion: IconoInflacion,
  acoplamiento: IconoAcoplamiento,
  cobertura: IconoPortafolio,
  riesgo: IconoRiesgo,
  mercado: IconoMercado,
  transacciones: IconoTransacciones,
  simulador: IconoSimulador,
  historial: IconoHistorial,
  comparar: IconoComparar,
  cuenta: IconoCuenta,
  alertas: IconoAlertas,
  reporte: IconoReporte,
  subir: IconoSubir,
};

// Fusionar rutas base con las de producto ordenando Dashboard al principio
const RUTAS_ORDENADAS = [
  RUTAS_PRODUCTO.find((r) => r.id === "dashboard"),
  ...RUTAS_BASE.filter((r) => r.id !== "onboarding" && r.grupo === "analisis"),
  ...RUTAS_PRODUCTO.filter((r) => r.id !== "dashboard" && r.grupo === "analisis"),
  ...RUTAS_PRODUCTO.filter((r) => r.grupo === "cuenta"),
  ...RUTAS_BASE.filter((r) => r.grupo === "oculta"),
  ...RUTAS_PRODUCTO.filter((r) => r.grupo === "oculta"),
].filter(Boolean);

import { LanguageProvider, useLanguage } from "./i18n/LanguageContext.jsx";

export default function App() {
  return (
    <LanguageProvider>
      <SesionProvider>
        <Aplicacion />
      </SesionProvider>
    </LanguageProvider>
  );
}

function Aplicacion() {
  const { hayCuentas, cargando: cargandoSesion, sesion, usuario, salir } = useSesion();
  const { idioma, cambiarIdioma, t, esIngles, esEspanol } = useLanguage();
  const [guardando, setGuardando] = useState(false);
  const [avisoGuardado, setAvisoGuardado] = useState(null);

  const [backendListo, setBackendListo] = useState(false);
  const [pesos, setPesos] = useState(demoData.pesos);
  const [datos, setDatos] = useState(demoData);
  const [vista, setVista] = useState("landing");
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
    esperarBackend().then(async (listo) => {
      setBackendListo(listo);
      if (listo) {
        try {
          const baseline = await getCarteraBase(buffer, horizonte);
          if (baseline?.pesos && baseline?.optimo) {
            setPesos(baseline.pesos);
            setDatos(baseline);
          }
        } catch {
          // Si falla, se mantiene la estructura inicial
        }
      }
    });
  }, []);

  const usarPdf = async (archivo) => {
    setOcupadoFlujo(true);
    setErrorPdf(null);
    try {
      const parsed = await parseStatement(archivo);
      setPesos(parsed.pesos);
      setDatos(await calcularTodo(parsed.pesos, buffer, horizonte));
      setVista("dashboard");
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
      const baseline = await getCarteraBase(buffer, horizonte);
      if (baseline?.pesos && baseline?.optimo) {
        setPesos(baseline.pesos);
        setDatos(baseline);
      } else {
        setPesos(demoData.pesos);
        setDatos(await calcularTodo(demoData.pesos, buffer, horizonte));
      }
    } catch {
      try {
        setPesos(demoData.pesos);
        setDatos(await calcularTodo(demoData.pesos, buffer, horizonte));
      } catch {
        setDatos(demoData);
      }
    } finally {
      setOcupadoFlujo(false);
      setVista("dashboard");
    }
  };

  const marcarRevisado = () => {
    const snapshot = {
      fecha: new Date().toISOString(),
      delta: datos.inflacion?.delta_anualizado ?? 0.012,
      pesos: datos.pesos,
      weights: datos.optimo?.weights,
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
    [pesos, datos?.optimo?.weights]
  );

  const reintentarRiesgo = useCallback(() => {
    setErrorRiesgo(null);
    cambiarHorizonte(horizonte);
  }, [cambiarHorizonte, horizonte]);

  const guardar = async () => {
    setGuardando(true);
    setAvisoGuardado(null);
    try {
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
      setAvisoGuardado("Análisis guardado en Supabase.");
    } catch (error) {
      setAvisoGuardado(error.message);
    } finally {
      setGuardando(false);
      setTimeout(() => setAvisoGuardado(null), 4000);
    }
  };

  const contextoProducto = useMemo(
    () => ({
      datos,
      setDatos,
      pesos,
      setPesos,
      horizonte,
      buffer,
      usuario,
      irA: setVista,
    }),
    [datos, pesos, horizonte, buffer, usuario]
  );

  const rutaActiva = RUTAS_ORDENADAS.find((r) => r.id === vista) || RUTAS_ORDENADAS[0];
  const bloqueadaPorSesion = hayCuentas && rutaActiva.privada && !sesion;

  const nombreUsuario =
    usuario?.user_metadata?.nombre ||
    (usuario?.email ? usuario.email.split("@")[0] : "Invitado");

  if (vista === "landing") {
    return (
      <Landing
        onExplorar={() => setVista(sesion ? "dashboard" : "acceso")}
        onAnalizar={() => setVista(sesion ? "onboarding" : "registro")}
        onAcceso={() => setVista("acceso")}
        onRegistro={() => setVista("registro")}
      />
    );
  }

  if (cargandoSesion) {
    return (
      <div className="pantalla-carga-global">
        <div className="spinner-neon" />
        <p>{t("layout.loadingApp")}</p>
      </div>
    );
  }

  // Si no hay sesión iniciada, el dashboard y todas las pantallas protegidas están estrictamente bloqueadas
  if (!sesion) {
    return (
      <Acceso
        modoInicial={vista === "registro" ? "registrar" : "entrar"}
        onListo={() => setVista("dashboard")}
        onCancelar={() => setVista("landing")}
      />
    );
  }

  return (
    <div className="layout-helios-app">
      {/* BARRA LATERAL (SIDEBAR) ESTILO HELIOS / SAVANCE */}
      <aside className="sidebar-helios">
        <div className="sidebar-marca" onClick={() => setVista("dashboard")}>
          <div className="marca-logo-glifo">
            <img src="/logo.png" alt="LifeHedge Logo" className="marca-logo-img" />
          </div>
          <div className="marca-texto">
            <span className="marca-titulo">LifeHedge</span>
            <span className="marca-subtitulo">{t("layout.brandSub")}</span>
          </div>
        </div>

        <div className="sidebar-menu-scroll">
          <div className="menu-seccion-titulo">{t("layout.ldiAnalysis")}</div>
          <nav className="menu-nav">
            {RUTAS_ORDENADAS.filter((r) => r.grupo === "analisis").map((r) => {
              const Icono = MAPA_ICONOS[r.icono || r.id] || IconoDashboard;
              const activo = vista === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`nav-item-btn ${activo ? "activo" : ""}`}
                  onClick={() => setVista(r.id)}
                >
                  <span className="nav-icono">
                    <Icono size={18} />
                  </span>
                  <span className="nav-texto">{t("nav." + r.id, {}, r.etiqueta)}</span>
                  {activo && <span className="pill-activo-glow" />}
                </button>
              );
            })}
          </nav>

          <div className="menu-seccion-titulo">{t("layout.portfolioAccount")}</div>
          <nav className="menu-nav">
            {RUTAS_ORDENADAS.filter((r) => r.grupo === "cuenta").map((r) => {
              const Icono = MAPA_ICONOS[r.icono || r.id] || IconoHistorial;
              const activo = vista === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`nav-item-btn ${activo ? "activo" : ""}`}
                  onClick={() => setVista(r.id)}
                >
                  <span className="nav-icono">
                    <Icono size={18} />
                  </span>
                  <span className="nav-texto">{t("nav." + r.id, {}, r.etiqueta)}</span>
                  {activo && <span className="pill-activo-glow" />}
                </button>
              );
            })}
            <button
              type="button"
              className={`nav-item-btn ${vista === "onboarding" ? "activo" : ""}`}
              onClick={() => setVista("onboarding")}
            >
              <span className="nav-icono">
                <IconoSubir size={18} />
              </span>
              <span className="nav-texto">{t("layout.uploadStatement")}</span>
            </button>
          </nav>
        </div>

        {/* PERFIL / USUARIO EN EL PIE DE LA BARRA LATERAL */}
        <div className="sidebar-usuario-pie">
          {sesion ? (
            <div className="chip-usuario-sidebar" onClick={() => setVista("cuenta")}>
              <div className="avatar-circulo">
                {nombreUsuario.charAt(0).toUpperCase()}
              </div>
              <div className="usuario-info-text">
                <span className="usuario-nombre-txt">{nombreUsuario}</span>
                <span className="usuario-email-txt">{usuario?.email}</span>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <button
                type="button"
                className="btn-login-sidebar"
                onClick={() => setVista("acceso")}
              >
                {t("layout.signIn")}
              </button>
              <button
                type="button"
                className="btn-login-sidebar"
                style={{
                  background: "rgba(248, 204, 27, 0.12)",
                  borderColor: "rgba(248, 204, 27, 0.35)",
                  color: "#f8cc1b"
                }}
                onClick={() => setVista("registro")}
              >
                {t("layout.signUp")}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL + HEADER SUPERIOR */}
      <div className="main-viewport-helios">
        <header className="header-helios">
          <div className="header-izq">
            <span className="breadcrumb-seccion">LifeHedge</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-actual">{t("nav." + rutaActiva.id, {}, rutaActiva.etiqueta)}</span>
          </div>

          <div className="header-der">
            {/* Selector Rápido de Idioma */}
            <div className="selector-idioma-pill">
              <button
                type="button"
                className={`btn-idioma ${esEspanol ? "activo" : ""}`}
                onClick={() => cambiarIdioma("es")}
                title="Cambiar a Español"
              >
                ES
              </button>
              <button
                type="button"
                className={`btn-idioma ${esIngles ? "activo" : ""}`}
                onClick={() => cambiarIdioma("en")}
                title="Switch to English"
              >
                EN
              </button>
            </div>

            {/* Estado del Backend */}
            <div className={`status-backend-pill ${backendListo ? "conectado" : "calentando"}`}>
              <span className="pulso-dot" />
              <span>{backendListo ? t("layout.ldiOnline") : t("layout.warmingEngine")}</span>
            </div>

            {/* Alertas */}
            <button
              type="button"
              className="btn-icono-header"
              aria-label={t("layout.viewAlerts")}
              onClick={() => setVista("alertas")}
            >
              <IconoAlertas size={18} />
              {alertasActivas > 0 && (
                <span className="badge-notificacion">{alertasActivas}</span>
              )}
            </button>

            {/* Reporte Ejecutivo */}
            <button
              type="button"
              className="btn-header-reporte"
              onClick={() => setVista("reporte")}
            >
              <IconoReporte size={16} /> Reporte
            </button>

            {/* Guardar en Supabase */}
            {sesion && (
              <button
                type="button"
                className="btn-header-guardar"
                onClick={guardar}
                disabled={guardando}
              >
                {guardando ? "Guardando…" : "Guardar Cartera"}
              </button>
            )}

            {avisoGuardado && (
              <div className="toast-aviso">{avisoGuardado}</div>
            )}
          </div>
        </header>

        <main className="area-vistas-scroll">
          {bloqueadaPorSesion ? (
            <section className="panel-bloqueo-sesion">
              <div className="candado-icono"><IconoCandado size={32} /></div>
              <h2>Sección Exclusiva para Miembros</h2>
              <p>Inicia sesión o crea una cuenta para acceder a tu historial y comparar escenarios.</p>
              <button
                type="button"
                className="btn-accion-principal"
                onClick={() => setVista("acceso")}
              >
                Entrar a mi Cuenta
              </button>
            </section>
          ) : (
            <>
              {vista === "onboarding" && (
                <Onboarding
                  onPdf={usarPdf}
                  onDemo={usarDemo}
                  ocupado={ocupadoFlujo}
                  error={errorPdf}
                />
              )}
              {vista === "inflacion" && (
                <Inflacion
                  datos={datos}
                  ocupadoEditor={recalculandoCanasta}
                  errorEditor={errorCanasta}
                  onCanasta={cambiarCanasta}
                />
              )}
              {vista === "cobertura" && (
                <Cobertura
                  optimo={datos.optimo}
                  onBuffer={cambiarBuffer}
                  ocupado={recalculandoCobertura}
                  error={errorCobertura}
                  onRetry={reintentarCobertura}
                />
              )}
              {vista === "riesgo" && (
                <Riesgo
                  riesgo={datos.riesgo}
                  horizonte={horizonte}
                  onHorizonte={cambiarHorizonte}
                  ocupado={recalculandoRiesgo}
                  error={errorRiesgo}
                  onRetry={reintentarRiesgo}
                />
              )}
              {vista === "alertas" && (
                <Alertas
                  alertas={alertas}
                  revision={revision}
                  onRevisar={marcarRevisado}
                  datos={datos}
                  onIr={setVista}
                />
              )}
              {vista === "reporte" && (
                <Reporte datos={datos} horizonte={horizonte} buffer={buffer} />
              )}
              {RUTAS_PRODUCTO.map((r) =>
                vista === r.id ? <div key={r.id}>{r.render(contextoProducto)}</div> : null
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
