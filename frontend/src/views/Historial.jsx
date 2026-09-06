import { useCallback, useEffect, useState } from "react";

import { useSesion } from "../auth/SesionProvider.jsx";
import {
  borrarAnalisis,
  leerAnalisis,
  listarAnalisis,
  renombrarAnalisis,
} from "../datos/analisis.js";
import { fmtFecha, fmtPct, fmtPctConSigno } from "../formato.js";

export default function Historial({ onAbrir }) {
  const { hayCuentas, sesion, esInvitado } = useSesion();

  const [filas, setFilas] = useState(null); // null = cargando
  const [error, setError] = useState(null);
  const [editando, setEditando] = useState(null);
  const [borrador, setBorrador] = useState("");

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setFilas(await listarAnalisis());
    } catch (e) {
      setError(e.message);
      setFilas([]);
    }
  }, []);

  useEffect(() => {
    if (hayCuentas && sesion) cargar();
    else setFilas([]);
  }, [hayCuentas, sesion, cargar]);

  const abrir = async (id) => {
    setError(null);
    try {
      const completo = await leerAnalisis(id);
      onAbrir?.(completo);
    } catch (e) {
      setError(e.message);
    }
  };

  const confirmarNombre = async (id) => {
    const etiqueta = borrador.trim();
    setEditando(null);
    if (!etiqueta) return;
    try {
      await renombrarAnalisis(id, etiqueta);
      setFilas((actual) =>
        actual.map((f) => (f.id === id ? { ...f, etiqueta } : f))
      );
    } catch (e) {
      setError(e.message);
    }
  };

  const eliminar = async (fila) => {
    if (!window.confirm(`¿Borrar "${fila.etiqueta}"? No se puede deshacer.`)) return;
    try {
      await borrarAnalisis(fila.id);
      setFilas((actual) => actual.filter((f) => f.id !== fila.id));
    } catch (e) {
      setError(e.message);
    }
  };

  if (!sesion) {
    return (
      <section className="vista">
        <h2>Historial</h2>
        <div className="panel estado-vacio">
          <p>Inicia sesión para guardar y consultar tus análisis.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="vista">
      <div className="vista__encabezado">
        <h2>Historial</h2>
        {esInvitado ? (
          <span className="badge-stale">
            Sesión de invitado: se pierde al cerrar el navegador
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="panel panel-error" role="alert">
          <p>{error}</p>
          <button type="button" className="boton-secundario" onClick={cargar}>
            Reintentar
          </button>
        </div>
      ) : null}

      {filas === null ? (
        <ul className="lista-esqueleto" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="esqueleto-fila" />
          ))}
        </ul>
      ) : filas.length === 0 ? (
        <div className="panel estado-vacio">
          <p>
            Aún no has guardado ningún análisis. Sube tu estado de cuenta y guarda el
            resultado para verlo aquí.
          </p>
        </div>
      ) : (
        <div className="tabla-desplazable">
          <table className="tabla">
            <thead>
              <tr>
                <th>Análisis</th>
                <th>Fecha</th>
                <th>Delta</th>
                <th>Cobertura</th>
                <th>Tracking error</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.id}>
                  <td>
                    {editando === fila.id ? (
                      <input
                        className="entrada-inline"
                        value={borrador}
                        autoFocus
                        onChange={(e) => setBorrador(e.target.value)}
                        onBlur={() => confirmarNombre(fila.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmarNombre(fila.id);
                          if (e.key === "Escape") setEditando(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="enlace"
                        onClick={() => {
                          setEditando(fila.id);
                          setBorrador(fila.etiqueta);
                        }}
                      >
                        {fila.etiqueta}
                      </button>
                    )}
                  </td>
                  <td>{fmtFecha(fila.creado_en)}</td>
                  <td
                    className={
                      fila.delta_anualizado > 0 ? "cifra-alerta" : "cifra-positiva"
                    }
                  >
                    {fmtPctConSigno(fila.delta_anualizado)}
                  </td>
                  <td>{fmtPct(fila.phe)}</td>
                  <td>{fmtPct(fila.tev)}</td>
                  <td className="acciones-fila">
                    <button
                      type="button"
                      className="boton-secundario"
                      onClick={() => abrir(fila.id)}
                    >
                      Abrir
                    </button>
                    <button
                      type="button"
                      className="boton-peligro"
                      onClick={() => eliminar(fila)}
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
  );
}
