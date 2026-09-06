import { useState } from "react";

import { useSesion } from "../auth/SesionProvider.jsx";

const MINIMO_CONTRASENA = 8;

export default function Acceso({ onListo }) {
  const { hayCuentas, entrar, registrar, entrarComoInvitado } = useSesion();

  const [modo, setModo] = useState("entrar"); // "entrar" | "registrar"
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);

  const registrando = modo === "registrar";

  const enviar = async (evento) => {
    evento.preventDefault();
    setError(null);

    if (contrasena.length < MINIMO_CONTRASENA) {
      setError(`La contraseña debe tener al menos ${MINIMO_CONTRASENA} caracteres.`);
      return;
    }

    setOcupado(true);
    try {
      if (registrando) {
        await registrar(correo.trim(), contrasena, nombre.trim());
      } else {
        await entrar(correo.trim(), contrasena);
      }
      onListo?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const comoInvitado = async () => {
    setError(null);
    setOcupado(true);
    try {
      await entrarComoInvitado();
      onListo?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  if (!hayCuentas) {
    return (
      <section className="acceso">
        <h1>Cuentas sin configurar</h1>
        <p>
          Faltan <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en{" "}
          <code>frontend/.env</code>. Sin ellas no se puede iniciar sesión ni guardar
          análisis.
        </p>
      </section>
    );
  }

  return (
    <section className="acceso">
      <h1>{registrando ? "Crea tu cuenta" : "Entra a LifeHedge"}</h1>
      <p className="acceso-lema">
        Guarda tus análisis, compara meses y lleva el historial de tu poder adquisitivo.
      </p>

      <form className="acceso-form" onSubmit={enviar}>
        {registrando ? (
          <label className="campo">
            <span>Nombre</span>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoComplete="name"
              required
            />
          </label>
        ) : null}

        <label className="campo">
          <span>Correo</span>
          <input
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label className="campo">
          <span>Contraseña</span>
          <input
            type="password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            autoComplete={registrando ? "new-password" : "current-password"}
            minLength={MINIMO_CONTRASENA}
            required
          />
        </label>

        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="boton-primario" disabled={ocupado}>
          {ocupado ? "Un momento…" : registrando ? "Crear cuenta" : "Entrar"}
        </button>
      </form>

      <p className="acceso-alterno">
        {registrando ? "¿Ya tienes cuenta?" : "¿Aún no tienes cuenta?"}{" "}
        <button
          type="button"
          className="enlace"
          onClick={() => {
            setModo(registrando ? "entrar" : "registrar");
            setError(null);
          }}
        >
          {registrando ? "Inicia sesión" : "Regístrate"}
        </button>
      </p>

      <div className="acceso-separador">
        <span>o</span>
      </div>

      <button
        type="button"
        className="boton-demo"
        onClick={comoInvitado}
        disabled={ocupado}
      >
        Explorar sin cuenta
      </button>
      <p className="acceso-nota">
        Entras como invitado y puedes usar todo el motor. Tus datos viven solo en esa
        sesión: para conservarlos, crea una cuenta.
      </p>
    </section>
  );
}
