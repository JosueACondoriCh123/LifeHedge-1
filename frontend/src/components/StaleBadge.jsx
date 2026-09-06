import { fmtFecha } from "../formato.js";

export default function StaleBadge({ stale, asOf }) {
  if (!stale) return null;
  return <span className="badge-stale">Datos guardados del {fmtFecha(asOf)}</span>;
}
