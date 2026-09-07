import React, { useState, useMemo } from "react";
import { useSesion } from "../auth/SesionProvider.jsx";
import { supabase } from "../datos/supabase.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";

const MINIMO_CONTRASENA = 8;

export default function Acceso({ onListo, onCancelar, modoInicial = "entrar" }) {
  const { hayCuentas, entrar, registrar } = useSesion();
  const { t, esIngles, cambiarIdioma } = useLanguage();

  const [modo, setModo] = useState(modoInicial); // "entrar" | "registrar"
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [confirmarContrasena, setConfirmarContrasena] = useState("");
  const [perfilInversor, setPerfilInversor] = useState("patrimonial");
  const [recordarSesion, setRecordarSesion] = useState(true);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [verContrasena, setVerContrasena] = useState(false);
  const [verConfirmar, setVerConfirmar] = useState(false);

  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);
  const [modalOlvido, setModalOlvido] = useState(false);
  const [correoOlvido, setCorreoOlvido] = useState("");

  const registrando = modo === "registrar";

  // Medidor de fuerza de contraseña
  const fuerzaContrasena = useMemo(() => {
    if (!contrasena) return { nivel: 0, etiqueta: "Introduce una contraseña", clase: "" };
    let puntaje = 0;
    if (contrasena.length >= 8) puntaje++;
    if (contrasena.length >= 12) puntaje++;
    if (/[A-Z]/.test(contrasena)) puntaje++;
    if (/[0-9]/.test(contrasena)) puntaje++;
    if (/[^A-Za-z0-9]/.test(contrasena)) puntaje++;

    if (puntaje <= 2) return { nivel: 1, etiqueta: "Básica (agrega números y mayúsculas)", clase: "activa-debil" };
    if (puntaje === 3) return { nivel: 2, etiqueta: "Media (buen balance)", clase: "activa-media" };
    if (puntaje === 4) return { nivel: 3, etiqueta: "Buena (resistente)", clase: "activa-buena" };
    return { nivel: 4, etiqueta: "Excelente (alta seguridad bancaria)", clase: "activa-segura" };
  }, [contrasena]);

  const coincideContrasena = registrando
    ? contrasena && confirmarContrasena ? contrasena === confirmarContrasena : true
    : true;

  const enviar = async (evento) => {
    evento.preventDefault();
    setError(null);
    setExito(null);

    if (contrasena.length < MINIMO_CONTRASENA) {
      setError(`La contraseña debe tener al menos ${MINIMO_CONTRASENA} caracteres.`);
      return;
    }

    if (registrando) {
      if (contrasena !== confirmarContrasena) {
        setError("Las contraseñas no coinciden. Por favor verifícalas.");
        return;
      }
      if (!aceptaTerminos) {
        setError("Debes aceptar los Términos de Servicio y el Aviso de Privacidad.");
        return;
      }
    }

    setOcupado(true);
    try {
      if (registrando) {
        await registrar(correo.trim(), contrasena, nombre.trim());
        setExito("Cuenta creada exitosamente. Redirigiendo a tu portafolio patrimonial…");
      } else {
        await entrar(correo.trim(), contrasena);
        setExito("Bienvenido a LifeHedge. Iniciando sesión…");
      }
      setTimeout(() => {
        onListo?.();
      }, 600);
    } catch (e) {
      setError(e.message || "No pudimos procesar tu solicitud. Intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  };

  const rellenarDemo = () => {
    setCorreo("demo@lifehedge.mx");
    setContrasena("Coppel2026*");
    setModo("entrar");
    setError(null);
  };

  const recuperarContrasena = async (e) => {
    e.preventDefault();
    if (!correoOlvido.trim()) {
      setError("Ingresa tu correo para enviarte el enlace de recuperación.");
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      if (supabase) {
        await supabase.auth.resetPasswordForEmail(correoOlvido.trim());
      }
      setExito("Hemos enviado las instrucciones a tu correo.");
      setTimeout(() => setModalOlvido(false), 3000);
    } catch (err) {
      setError(err.message || "No fue posible enviar el correo de recuperación.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="pantalla-acceso-wrapper">
      <div className="acceso-fondo-resplandor" />

      <div className="acceso-card-master">
        {/* Selector rápido de idioma en la tarjeta */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
          <div
            className="idioma-pill-header"
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "20px",
              padding: "2px 4px",
              fontSize: "0.75rem",
              gap: "2px",
            }}
          >
            <button
              type="button"
              onClick={() => cambiarIdioma("es")}
              style={{
                background: !esIngles ? "rgba(59, 167, 255, 0.25)" : "transparent",
                color: !esIngles ? "#3ba7ff" : "var(--color-texto-apagado)",
                border: "none",
                borderRadius: "14px",
                padding: "2px 8px",
                cursor: "pointer",
                fontWeight: !esIngles ? 700 : 500,
                fontSize: "0.72rem",
              }}
            >
              ES
            </button>
            <button
              type="button"
              onClick={() => cambiarIdioma("en")}
              style={{
                background: esIngles ? "rgba(59, 167, 255, 0.25)" : "transparent",
                color: esIngles ? "#3ba7ff" : "var(--color-texto-apagado)",
                border: "none",
                borderRadius: "14px",
                padding: "2px 8px",
                cursor: "pointer",
                fontWeight: esIngles ? 700 : 500,
                fontSize: "0.72rem",
              }}
            >
              EN
            </button>
          </div>
        </div>

        {/* Cabecera de Marca */}
        <div className="acceso-marca-header">
          <div className="acceso-glifo-container">
            <img src="/logo.png" alt="LifeHedge Logo" className="acceso-logo-img" />
          </div>
          <h1 className="acceso-titulo-principal">
            {registrando
              ? esIngles ? "Create Institutional Account" : "Crear Cuenta Institucional"
              : esIngles ? "Sign In" : "Iniciar Sesión"}
          </h1>
          <p className="acceso-subtitulo">
            {registrando
              ? esIngles
                ? "Create your institutional account to link your expenditure basket, optimize hedging, and safeguard your purchasing power."
                : "Crea tu cuenta institucional para vincular tu canasta de gastos, optimizar cobertura y proteger tu poder adquisitivo."
              : esIngles
                ? "Access your inflation-hedged wealth vault powered by the convex quadratic optimization engine."
                : "Ingresa a tu bóveda patrimonial protegida contra la inflación con el motor de optimización convexa."}
          </p>
        </div>

        {/* Selector Segmentado: Iniciar Sesión / Registrarse */}
        <div className="acceso-tabs-segmented" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!registrando}
            className={`acceso-tab-btn ${!registrando ? "activo" : ""}`}
            onClick={() => {
              setModo("entrar");
              setError(null);
              setExito(null);
            }}
          >
            <span>{esIngles ? "Sign In" : "Iniciar Sesión"}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={registrando}
            className={`acceso-tab-btn ${registrando ? "activo" : ""}`}
            onClick={() => {
              setModo("registrar");
              setError(null);
              setExito(null);
            }}
          >
            <span>{esIngles ? "Create Account" : "Crear Cuenta"}</span>
          </button>
        </div>

        {/* Alertas de Error y Éxito */}
        {error && (
          <div className="acceso-alerta-box acceso-alerta-error" role="alert">
            <span style={{ fontWeight: 700 }}>!</span>
            <span>{error}</span>
          </div>
        )}

        {exito && (
          <div className="acceso-alerta-box acceso-alerta-exito" role="status">
            <span style={{ fontWeight: 700 }}>•</span>
            <span>{exito}</span>
          </div>
        )}

        {/* Modal / Vista rápida de olvido de contraseña */}
        {modalOlvido ? (
          <form className="acceso-formulario" onSubmit={recuperarContrasena}>
            <div className="acceso-campo-grupo">
              <label className="acceso-campo-etiqueta">
                <span>
                  {esIngles
                    ? "Enter your registered email to receive recovery instructions:"
                    : "Ingresa el correo registrado para recuperar tu acceso:"}
                </span>
              </label>
              <div className="acceso-input-caja">
                <span className="acceso-input-icono">@</span>
                <input
                  type="email"
                  className="acceso-input-texto"
                  placeholder="name@example.com"
                  value={correoOlvido}
                  onChange={(e) => setCorreoOlvido(e.target.value)}
                  required
                />
              </div>
            </div>
            <button type="submit" className="btn-acceso-submit" disabled={ocupado}>
              {ocupado
                ? esIngles ? "Sending link…" : "Enviando enlace..."
                : esIngles ? "Send Recovery Link" : "Enviar Enlace de Recuperación"}
            </button>
            <button
              type="button"
              className="acceso-volver-btn"
              onClick={() => setModalOlvido(false)}
            >
              {esIngles ? "← Cancel and back to sign in" : "← Cancelar y volver al inicio de sesión"}
            </button>
          </form>
        ) : (
          /* Formulario Principal */
          <form className="acceso-formulario" onSubmit={enviar}>
            {/* Campo Nombre (solo en Sign Up) */}
            {registrando && (
              <div className="acceso-campo-grupo">
                <label className="acceso-campo-etiqueta">
                  <span>{esIngles ? "Full Name or Legal Entity" : "Nombre Completo o Titular"}</span>
                </label>
                <div className="acceso-input-caja">
                  <span className="acceso-input-icono">ID</span>
                  <input
                    type="text"
                    className="acceso-input-texto"
                    placeholder={esIngles ? "e.g. Carlos Mendoza" : "Ej. Carlos Mendoza"}
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    autoComplete="name"
                    required
                  />
                </div>
              </div>
            )}

            {/* Campo Correo */}
            <div className="acceso-campo-grupo">
              <label className="acceso-campo-etiqueta">
                <span>{esIngles ? "Email Address" : "Correo Electrónico"}</span>
              </label>
              <div className="acceso-input-caja">
                <span className="acceso-input-icono">@</span>
                <input
                  type="email"
                  className="acceso-input-texto"
                  placeholder={esIngles ? "name@example.com" : "nombre@ejemplo.com"}
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* Campo Contraseña */}
            <div className="acceso-campo-grupo">
              <label className="acceso-campo-etiqueta">
                <span>{esIngles ? "Password" : "Contraseña"}</span>
                {!registrando && (
                  <button
                    type="button"
                    className="acceso-olvido-link"
                    onClick={() => {
                      setCorreoOlvido(correo);
                      setModalOlvido(true);
                      setError(null);
                    }}
                  >
                    {esIngles ? "Forgot password?" : "¿Olvidaste tu contraseña?"}
                  </button>
                )}
              </label>
              <div className="acceso-input-caja">
                <span className="acceso-input-icono">#</span>
                <input
                  type={verContrasena ? "text" : "password"}
                  className="acceso-input-texto"
                  placeholder={
                    registrando
                      ? esIngles ? "Minimum 8 characters" : "Mínimo 8 caracteres"
                      : esIngles ? "Your password" : "Tu contraseña"
                  }
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  autoComplete={registrando ? "new-password" : "current-password"}
                  minLength={MINIMO_CONTRASENA}
                  required
                />
                <button
                  type="button"
                  className="acceso-input-toggle-eye"
                  onClick={() => setVerContrasena(!verContrasena)}
                  title={verContrasena ? (esIngles ? "Hide" : "Ocultar") : (esIngles ? "Show" : "Mostrar")}
                  style={{ fontSize: "0.75rem", width: "auto", padding: "0 8px" }}
                >
                  {verContrasena ? (esIngles ? "Hide" : "Ocultar") : (esIngles ? "Show" : "Mostrar")}
                </button>
              </div>

              {/* Medidor interactivo de fuerza en registro */}
              {registrando && contrasena.length > 0 && (
                <div className="acceso-fuerza-password">
                  <div className="fuerza-barras">
                    <div className={`fuerza-barra ${fuerzaContrasena.nivel >= 1 ? fuerzaContrasena.clase : ""}`} />
                    <div className={`fuerza-barra ${fuerzaContrasena.nivel >= 2 ? fuerzaContrasena.clase : ""}`} />
                    <div className={`fuerza-barra ${fuerzaContrasena.nivel >= 3 ? fuerzaContrasena.clase : ""}`} />
                    <div className={`fuerza-barra ${fuerzaContrasena.nivel >= 4 ? fuerzaContrasena.clase : ""}`} />
                  </div>
                  <div className="fuerza-etiqueta-texto">
                    <span>{esIngles ? "Security: " : "Seguridad: "}{fuerzaContrasena.etiqueta}</span>
                    <span>{contrasena.length} {esIngles ? "chars" : "car."}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Confirmar Contraseña (solo en Sign Up) */}
            {registrando && (
              <div className="acceso-campo-grupo">
                <label className="acceso-campo-etiqueta">
                  <span>{esIngles ? "Confirm Password" : "Confirmar Contraseña"}</span>
                  {!coincideContrasena && (
                    <span style={{ color: "var(--rojo-coral)", fontSize: "0.72rem" }}>
                      {esIngles ? "Does not match" : "No coinciden"}
                    </span>
                  )}
                </label>
                <div className="acceso-input-caja">
                  <span className="acceso-input-icono">#</span>
                  <input
                    type={verConfirmar ? "text" : "password"}
                    className="acceso-input-texto"
                    placeholder={esIngles ? "Repeat your password" : "Repite tu contraseña"}
                    value={confirmarContrasena}
                    onChange={(e) => setConfirmarContrasena(e.target.value)}
                    autoComplete="new-password"
                    minLength={MINIMO_CONTRASENA}
                    required
                  />
                  <button
                    type="button"
                    className="acceso-input-toggle-eye"
                    onClick={() => setVerConfirmar(!verConfirmar)}
                    title={verConfirmar ? (esIngles ? "Hide" : "Ocultar") : (esIngles ? "Show" : "Mostrar")}
                    style={{ fontSize: "0.75rem", width: "auto", padding: "0 8px" }}
                  >
                    {verConfirmar ? (esIngles ? "Hide" : "Ocultar") : (esIngles ? "Show" : "Mostrar")}
                  </button>
                </div>
              </div>
            )}

            {/* Perfil de Inversor preferente (solo en Sign Up) */}
            {registrando && (
              <div className="acceso-campo-grupo">
                <label className="acceso-campo-etiqueta">
                  <span>{esIngles ? "Wealth Hedging Objective" : "Objetivo de Cobertura Patrimonial"}</span>
                </label>
                <select
                  className="acceso-input-texto"
                  value={perfilInversor}
                  onChange={(e) => setPerfilInversor(e.target.value)}
                  style={{ paddingLeft: "14px" }}
                >
                  <option value="patrimonial">
                    {esIngles
                      ? "Institutional LDI (Optimal hedge against household liabilities)"
                      : "Patrimonial LDI (Cobertura óptima contra gastos familiares)"}
                  </option>
                  <option value="conservador">
                    {esIngles
                      ? "Conservative (Maximum liquidity & Cetes 28D priority)"
                      : "Conservador (Prioridad liquidez y Cetes 28D)"}
                  </option>
                  <option value="crecimiento">
                    {esIngles
                      ? "Real Growth (Equity indexation to S&P 500 & Gold with Udibonos floor)"
                      : "Crecimiento Real (Indexación a S&P 500 y Oro con piso de Udibonos)"}
                  </option>
                </select>
              </div>
            )}

            {/* Checkbox de Términos o Recordar sesión */}
            {registrando ? (
              <label className="acceso-checkbox-fila">
                <input
                  type="checkbox"
                  checked={aceptaTerminos}
                  onChange={(e) => setAceptaTerminos(e.target.checked)}
                  required
                />
                <span>
                  {esIngles
                    ? "I accept the Terms of Service and Financial Privacy Notice compliant with LFPDPPP and banking security standards."
                    : "Acepto los Términos de Servicio y el Aviso de Privacidad Financiero conforme a la LFPDPPP y estándares de seguridad bancaria."}
                </span>
              </label>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label className="acceso-checkbox-fila">
                  <input
                    type="checkbox"
                    checked={recordarSesion}
                    onChange={(e) => setRecordarSesion(e.target.checked)}
                  />
                  <span>{esIngles ? "Keep me signed in" : "Mantener sesión iniciada"}</span>
                </label>
                <button
                  type="button"
                  className="acceso-olvido-link"
                  onClick={rellenarDemo}
                  title={esIngles ? "Fill pre-configured demo credentials" : "Rellenar credenciales de prueba preconfiguradas"}
                >
                  {esIngles ? "Demo Account" : "Cuenta Demo"}
                </button>
              </div>
            )}

            {/* Botón Principal de Envío */}
            <button type="submit" className="btn-acceso-submit" disabled={ocupado}>
              {ocupado ? (
                <>
                  <span className="pulso-chico" /> {esIngles ? "Processing secure access…" : "Procesando acceso seguro..."}
                </>
              ) : registrando ? (
                esIngles ? "Create Institutional Account →" : "Crear Cuenta Institucional →"
              ) : (
                esIngles ? "Enter LifeHedge →" : "Entrar a LifeHedge →"
              )}
            </button>
          </form>
        )}

        {/* Botón Volver al Inicio */}
        <button
          type="button"
          className="acceso-volver-btn"
          style={{ marginTop: "1.5rem" }}
          onClick={() => onCancelar?.()}
        >
          {esIngles ? "← Back to home page" : "← Volver a la página de inicio"}
        </button>

        {/* Garantías Institucionales de Seguridad */}
        <div className="acceso-garantias-footer">
          <div className="acceso-garantia-item">
            <span className="acceso-garantia-punto">•</span>
            <span>{esIngles ? "AES-256 Encryption & Row Level Security (RLS)" : "Cifrado AES-256 y Row Level Security (RLS)"}</span>
          </div>
          <div className="acceso-garantia-item">
            <span className="acceso-garantia-punto">•</span>
            <span>{esIngles ? "Real-time official Banxico & INEGI data feeds" : "Feeds oficiales en tiempo real de Banxico e INEGI"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
