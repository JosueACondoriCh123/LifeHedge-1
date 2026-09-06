import { useCallback, useEffect, useState } from "react";

import { useSesion } from "../auth/SesionProvider.jsx";
import {
  borrarEstado,
  borrarTodo,
  listarEstados,
  urlFirmada,
} from "../datos/estados.js";
import { fmtFecha } from "../formato.js";

const PALABRA_CONFIRMACION = "BORRAR";

function pesoLegible(bytes) {
  if (!bytes) return "—";
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

export default function Cuenta() {
  const { sesion, usuario, esInvitado, salir } = useSesion();

  const [estados, setEstados] = useState(null);
  const [error, setError] = useState(null);
  const [confirmacion, setConfirmacion] = useState("");
  const [borrando, setBorrando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setEstados(await listarEstados());
    } catch (e) {
      setError(e.message);
      setEstados([]);
    }
  }, []);

  useEffect(() => {
    if (sesion) cargar();
    else setEstados([]);
  }, [sesion, cargar]);

  const descargar = async (estado) => {
    setError(null);
    try {
      window.open(await urlFirmada(estado.ruta_storage), "_blank", "noopener");
    } catch (e) {
      setError(e.message);
    }
  };

  const eliminar = async (estado) => {
    if (!window.confirm(`¿Borrar "${estado.nombre_archivo}"? No se puede deshacer.`)) {
      return;
    }
    try {
      await borrarEstado(estado);
      setEstados((actual) => actual.filter((e) => e.id !== estado.id));
    } catch (e) {
      setError(e.message);
    }
  };

  const eliminarTodo = async () => {
    setBorrando(true);
    setError(null);
    try {
      await borrarTodo();
      setEstados([]);
      setConfirmacion("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBorrando(false);
    }
  };

  if (!sesion) {
    return (
      <section className="vista">
        <h2>Tu cuenta</h2>
        <div className="panel estado-vacio">
          <p>Inicia sesión para ver y administrar tus datos.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="vista">
      <div className="vista__encabezado">
        <h2>Tu cuenta y privacidad</h2>
      </div>

      {error ? (
        <div className="panel panel-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <section className="panel">
        <h3>Sesión</h3>
        <dl className="lista-datos">
          <div>
            <dt>Correo</dt>
            <dd>{esInvitado ? "Invitado, sin correo" : usuario?.email ?? "—"}</dd>
          </div>
          <div>
            <dt>Tipo</dt>
            <dd>{esInvitado ? "Invitado" : "Cuenta registrada"}</dd>
          </div>
        </dl>
        {esInvitado ? (
          <p className="panel-nota">
            Como invitado puedes usar todo el motor, pero tus datos se pierden al cerrar
            el navegador. Crea una cuenta para conservarlos.
          </p>
        ) : null}
        <button type="button" className="boton-secundario" onClick={salir}>
          Cerrar sesión
        </button>
      </section>

      <section className="panel">
        <h3>Estados de cuenta guardados</h3>
        {estados === null ? (
          <ul className="lista-esqueleto" aria-hidden="true">
            {[0, 1].map((i) => (
              <li key={i} className="esqueleto-fila" />
            ))}
          </ul>
        ) : estados.length === 0 ? (
          <p className="panel-nota">No tienes estados de cuenta guardados.</p>
        ) : (
          <div className="tabla-desplazable">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Archivo</th>
                  <th>Emisor</th>
                  <th>Subido</th>
                  <th>Se borra solo</th>
                  <th>Tamaño</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {estados.map((estado) => (
                  <tr key={estado.id}>
                    <td>{estado.nombre_archivo}</td>
                    <td>{estado.emisor ?? "—"}</td>
                    <td>{fmtFecha(estado.subido_en)}</td>
                    <td>{fmtFecha(estado.borrar_despues_de)}</td>
                    <td>{pesoLegible(estado.bytes)}</td>
                    <td className="acciones-fila">
                      <button
                        type="button"
                        className="boton-secundario"
                        onClick={() => descargar(estado)}
                      >
                        Descargar
                      </button>
                      <button
                        type="button"
                        className="boton-peligro"
                        onClick={() => eliminar(estado)}
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Qué guardamos</h3>
        <p>
          Tu estado de cuenta en PDF se guarda cifrado en un almacenamiento privado al
          que solo tú tienes acceso, junto con los análisis que decidas conservar. Nadie
          más puede leerlos, ni siquiera con el enlace: las descargas usan direcciones
          que caducan en un minuto.
        </p>
        <p>
          Cada archivo se borra automáticamente a los 90 días de subirlo. La columna
          &laquo;se borra solo&raquo; te dice la fecha exacta de cada uno.
        </p>
      </section>

      <section className="panel panel-peligro">
        <h3>Borrar todos mis datos</h3>
        <p>
          Elimina tus estados de cuenta, sus archivos y todos tus análisis guardados. No
          se puede deshacer.
        </p>
        <label className="campo">
          <span>
            Escribe <strong>{PALABRA_CONFIRMACION}</strong> para confirmar
          </span>
          <input
            type="text"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          className="boton-peligro"
          disabled={confirmacion !== PALABRA_CONFIRMACION || borrando}
          onClick={eliminarTodo}
        >
          {borrando ? "Borrando…" : "Borrar todo"}
        </button>
      </section>
    </section>
  );
}
