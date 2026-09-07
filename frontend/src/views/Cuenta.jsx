import { useCallback, useEffect, useState } from "react";

import { useSesion } from "../auth/SesionProvider.jsx";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import {
  borrarEstado,
  borrarTodo,
  listarEstados,
  urlFirmada,
} from "../datos/estados.js";
import { obtenerBitacoraAuditoria } from "../datos/analisis.js";
import { fmtFecha } from "../formato.js";

function pesoLegible(bytes) {
  if (!bytes) return "—";
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

export default function Cuenta() {
  const { sesion, usuario, esInvitado, salir } = useSesion();
  const { idioma, cambiarIdioma, t, esIngles, esEspanol } = useLanguage();

  const palabraConfirmacion = esIngles ? "DELETE" : "BORRAR";

  const [estados, setEstados] = useState(null);
  const [error, setError] = useState(null);
  const [confirmacion, setConfirmacion] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [bitacora, setBitacora] = useState([]);
  const [cargandoBitacora, setCargandoBitacora] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setEstados(await listarEstados());
    } catch (e) {
      setError(e.message);
      setEstados([]);
    }

    try {
      setCargandoBitacora(true);
      const resBit = await obtenerBitacoraAuditoria(15);
      setBitacora(resBit);
    } catch (e) {
      console.warn("No se pudo cargar la bitácora:", e.message);
    } finally {
      setCargandoBitacora(false);
    }
  }, []);

  useEffect(() => {
    if (sesion) cargar();
    else {
      setEstados([]);
      setBitacora([]);
    }
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
    const confirmMsg = t("cuenta.deleteConfirmMsg", { file: estado.nombre_archivo });
    if (!window.confirm(confirmMsg)) {
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
        <h2>{t("cuenta.title")}</h2>
        <div className="panel estado-vacio">
          <p>{t("cuenta.notSignedInPrompt")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="vista">
      <div className="vista__encabezado">
        <h2>{t("cuenta.title")}</h2>
        <p className="subtitulo-vista" style={{ marginTop: "4px" }}>
          {t("cuenta.subtitle")}
        </p>
      </div>

      {error ? (
        <div className="panel panel-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {/* PANEL 1: CONFIGURACIÓN DE IDIOMA */}
      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h3 style={{ margin: 0 }}>{t("cuenta.languageSectionTitle")}</h3>
            <p className="metrica-nota" style={{ margin: "4px 0 0 0" }}>
              {t("cuenta.languageSectionSubtitle")}
            </p>
          </div>
          <span className="badge-seccion-neon" style={{ fontSize: "0.75rem" }}>
            {esIngles ? "EN (English)" : "ES (Español)"}
          </span>
        </div>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "14px" }}>
          <button
            type="button"
            className={`boton-secundario ${esEspanol ? "activo" : ""}`}
            style={{
              padding: "10px 20px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontWeight: 600,
              background: esEspanol ? "rgba(59, 167, 255, 0.16)" : "transparent",
              borderColor: esEspanol ? "#3ba7ff" : "var(--color-borde)",
              color: esEspanol ? "#ffffff" : "var(--color-texto)",
            }}
            onClick={() => cambiarIdioma("es")}
          >
            <span>{t("cuenta.langEs")}</span>
            {esEspanol && (
              <span style={{ fontSize: "0.68rem", background: "#3ba7ff", color: "#000", padding: "1px 6px", borderRadius: "10px", fontWeight: 700 }}>
                {t("cuenta.activeLang")}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`boton-secundario ${esIngles ? "activo" : ""}`}
            style={{
              padding: "10px 20px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontWeight: 600,
              background: esIngles ? "rgba(59, 167, 255, 0.16)" : "transparent",
              borderColor: esIngles ? "#3ba7ff" : "var(--color-borde)",
              color: esIngles ? "#ffffff" : "var(--color-texto)",
            }}
            onClick={() => cambiarIdioma("en")}
          >
            <span>{t("cuenta.langEn")}</span>
            {esIngles && (
              <span style={{ fontSize: "0.68rem", background: "#3ba7ff", color: "#000", padding: "1px 6px", borderRadius: "10px", fontWeight: 700 }}>
                {t("cuenta.activeLang")}
              </span>
            )}
          </button>
        </div>
      </section>

      {/* PANEL 2: SESIÓN */}
      <section className="panel">
        <h3>{t("cuenta.sessionTitle")}</h3>
        <dl className="lista-datos">
          <div>
            <dt>{t("cuenta.emailLabel")}</dt>
            <dd>{esInvitado ? t("cuenta.guestAccount") : usuario?.email ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("cuenta.typeLabel")}</dt>
            <dd>{esInvitado ? t("cuenta.guestAccount") : t("cuenta.registeredAccount")}</dd>
          </div>
        </dl>
        {esInvitado ? (
          <p className="panel-nota">
            {t("cuenta.guestNotice")}
          </p>
        ) : null}
        <button type="button" className="boton-secundario" onClick={salir}>
          {t("cuenta.signOutBtn")}
        </button>
      </section>

      {/* PANEL 3: ESTADOS DE CUENTA */}
      <section className="panel">
        <h3>{t("cuenta.savedStatementsTitle")}</h3>
        {estados === null ? (
          <ul className="lista-esqueleto" aria-hidden="true">
            {[0, 1].map((i) => (
              <li key={i} className="esqueleto-fila" />
            ))}
          </ul>
        ) : estados.length === 0 ? (
          <p className="panel-nota">{t("cuenta.noStatements")}</p>
        ) : (
          <div className="tabla-desplazable">
            <table className="tabla">
              <thead>
                <tr>
                  <th>{t("cuenta.colFile")}</th>
                  <th>{t("cuenta.colIssuer")}</th>
                  <th>{t("cuenta.colUploaded")}</th>
                  <th>{t("cuenta.colAutoDelete")}</th>
                  <th>{t("cuenta.colSize")}</th>
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
                        {t("cuenta.btnDownload")}
                      </button>
                      <button
                        type="button"
                        className="boton-peligro"
                        onClick={() => eliminar(estado)}
                      >
                        {t("cuenta.btnDelete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* PANEL 4: BITÁCORA DE AUDITORÍA */}
      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h3 style={{ margin: 0 }}>{t("cuenta.auditLogTitle")}</h3>
            <p className="metrica-nota" style={{ margin: "4px 0 0 0" }}>
              {t("cuenta.auditLogSubtitle")}
            </p>
          </div>
          <span className="badge-seccion-neon" style={{ fontSize: "0.75rem", background: "rgba(16, 185, 129, 0.12)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
            {t("cuenta.auditChainActive")}
          </span>
        </div>

        {cargandoBitacora ? (
          <p className="panel-nota">{t("cuenta.auditQuerying")}</p>
        ) : bitacora.length === 0 ? (
          <p className="panel-nota">{t("cuenta.auditEmpty")}</p>
        ) : (
          <div className="tabla-desplazable">
            <table className="tabla" style={{ fontSize: "0.85rem" }}>
              <thead>
                <tr>
                  <th>{t("cuenta.colAction")}</th>
                  <th>{t("cuenta.colEntity")}</th>
                  <th>{t("cuenta.colId")}</th>
                  <th>{t("cuenta.colDateTime")}</th>
                  <th>{t("cuenta.colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {bitacora.map((ev) => (
                  <tr key={ev.id}>
                    <td>
                      <span className="tag-rubro" style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                        {ev.accion}
                      </span>
                    </td>
                    <td>{ev.entidad_tipo}</td>
                    <td style={{ fontFamily: "monospace", color: "var(--color-texto-apagado)", fontSize: "0.75rem" }}>
                      {ev.entidad_id ? ev.entidad_id.slice(0, 13) + "…" : "—"}
                    </td>
                    <td>{fmtFecha(ev.creado_en)}</td>
                    <td>
                      <span style={{ color: "#10b981", fontSize: "0.8rem", fontWeight: 600 }}>
                        {t("cuenta.verifiedBadge")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* PANEL 5: QUÉ GUARDAMOS */}
      <section className="panel">
        <h3>{t("cuenta.whatWeStoreTitle")}</h3>
        <p>{t("cuenta.whatWeStoreP1")}</p>
        <p>{t("cuenta.whatWeStoreP2")}</p>
      </section>

      {/* PANEL 6: ZONA DE PELIGRO */}
      <section className="panel panel-peligro">
        <h3>{t("cuenta.dangerZoneTitle")}</h3>
        <p>{t("cuenta.dangerZoneSubtitle")}</p>
        <label className="campo">
          <span>
            {t("cuenta.confirmLabelPrompt", { word: palabraConfirmacion })}
          </span>
          <input
            type="text"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            autoComplete="off"
            placeholder={palabraConfirmacion}
          />
        </label>
        <button
          type="button"
          className="boton-peligro"
          disabled={confirmacion !== palabraConfirmacion || borrando}
          onClick={eliminarTodo}
        >
          {borrando ? t("cuenta.btnDeleting") : t("cuenta.btnDeleteAll")}
        </button>
      </section>
    </section>
  );
}
