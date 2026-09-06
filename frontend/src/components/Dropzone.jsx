import { useRef, useState } from "react";

export default function Dropzone({ onArchivo, ocupado = false, error = null }) {
  const inputRef = useRef(null);
  const [sobre, setSobre] = useState(false);

  const soltar = (evento) => {
    evento.preventDefault();
    setSobre(false);
    if (ocupado) return;
    const archivo = evento.dataTransfer?.files?.[0];
    if (archivo) onArchivo(archivo);
  };

  const seleccionar = (evento) => {
    const archivo = evento.target.files?.[0];
    if (archivo) onArchivo(archivo);
    evento.target.value = "";
  };

  return (
    <div
      className={`dropzone${sobre ? " sobre" : ""}${ocupado ? " ocupado" : ""}`}
      onDragOver={(evento) => {
        evento.preventDefault();
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={soltar}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={seleccionar}
        hidden
      />
      <button
        type="button"
        className="dropzone-zona"
        onClick={() => inputRef.current?.click()}
        disabled={ocupado}
        aria-label="Subir estado de cuenta en PDF"
      >
        <strong>Suelta tu estado de cuenta aquí</strong>
        <span>o haz clic para elegir el archivo · sólo PDF</span>
      </button>
      {ocupado ? <p className="dropzone-progreso">Leyendo tu estado de cuenta…</p> : null}
      {error ? (
        <p className="dropzone-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
