import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import MetricCard from "../components/MetricCard.jsx";
import StaleBadge from "../components/StaleBadge.jsx";
import { fmtPct, fmtPctDetallado } from "../formato.js";
import { ETIQUETAS_RUBRO, RUBROS } from "../rubros.js";

function Delta({ inflacion }) {
  const positivo = inflacion.delta_anualizado > 0;
  return (
    <MetricCard
      etiqueta="Delta de Divergencia"
      valor={fmtPctDetallado(inflacion.delta_anualizado)}
      tono={positivo ? "alerta" : "positivo"}
      nota={
        positivo
          ? "Pagas más inflación que el promedio nacional"
          : "Pagas menos inflación que el promedio nacional"
      }
      destacada
    />
  );
}

function Canasta({ pesos, onConfirmar, ocupado, error }) {
  const [valores, setValores] = useState(() =>
    Object.fromEntries(RUBROS.map((r) => [r, Math.round(pesos[r] * 100)]))
  );
  const [pesosPrevios, setPesosPrevios] = useState(pesos);
  if (pesosPrevios !== pesos) {
    setPesosPrevios(pesos);
    setValores(Object.fromEntries(RUBROS.map((r) => [r, Math.round(pesos[r] * 100)])));
  }

  const total = RUBROS.reduce((s, r) => s + valores[r], 0);

  const normalizados = useMemo(
    () =>
      RUBROS.map((r) => ({
        rubro: r,
        peso: total > 0 ? valores[r] / total : 0,
      })),
    [valores, total]
  );

  return (
    <section className="panel-editor" aria-label="Editar canasta">
      <h3>Ajusta tu canasta</h3>
      <p className="panel-nota">
        Mueve los pesos y recalcula: el Delta de Divergencia y la cartera óptima
        responden en vivo.
      </p>
      <div className="editor-sliders">
        {RUBROS.map((r) => (
          <label key={r} className="editor-fila">
            <span>{ETIQUETAS_RUBRO[r]}</span>
            <input
              type="range"
              min="0"
              max="100"
              value={valores[r]}
              onChange={(e) =>
                setValores((v) => ({ ...v, [r]: Number(e.target.value) }))
              }
            />
            <span className="editor-valor">
              {total > 0 ? fmtPct(valores[r] / total) : "—"}
            </span>
          </label>
        ))}
      </div>
      {error ? <p className="panel-error" role="alert">{error}</p> : null}
      <button
        type="button"
        className="boton-primario"
        disabled={ocupado || total <= 0}
        onClick={() =>
          onConfirmar(Object.fromEntries(normalizados.map(({ rubro, peso }) => [rubro, peso])))
        }
      >
        {ocupado ? "Recalculando…" : "Recalcular con esta canasta"}
      </button>
    </section>
  );
}

export default function Inflacion({
  datos,
  ocupadoEditor,
  errorEditor,
  onCanasta,
}) {
  const { inflacion } = datos;
  const { pesos } = datos;

  const serie = useMemo(
    () =>
      inflacion.dates.map((mes, i) => ({
        mes,
        personal: inflacion.personal[i] * 100,
        general: inflacion.general[i] * 100,
      })),
    [inflacion]
  );

  const canastaOrdenada = useMemo(
    () =>
      Object.entries(pesos).sort((a, b) => b[1] - a[1]),
    [pesos]
  );

  const maxPeso = canastaOrdenada[0]?.[1] || 1;

  return (
    <div className="vista">
      <div className="vista-encabezado">
        <h2>Tu inflación</h2>
        <StaleBadge stale={inflacion.stale} asOf={inflacion.as_of} />
      </div>

      <div className="rejilla-metricas cuatro">
        <MetricCard
          etiqueta="Tu inflación anual"
          valor={fmtPct(inflacion.personal_anual)}
          nota="Canasta de tu estado de cuenta"
        />
        <MetricCard
          etiqueta="INPC oficial"
          valor={fmtPct(inflacion.general_anual)}
          nota="Promedio nacional (INEGI)"
        />
        <Delta inflacion={inflacion} />
        <MetricCard
          etiqueta="Volatilidad de tu canasta"
          valor={fmtPct(inflacion.volatilidad_anual)}
          nota="Variación anual de tu inflación"
        />
      </div>

      <section className="panel-grafica" aria-label="Inflación personal contra INPC general">
        <h3>Mensual: tu canasta vs. el país</h3>
        <div className="alto-grafica">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--linea)" vertical={false} />
              <XAxis dataKey="mes" minTickGap={40} tick={{ fontSize: 12 }} stroke="var(--tinta-suave)" />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="var(--tinta-suave)"
                tickFormatter={(v) => `${v.toFixed(1)}%`}
                width={52}
              />
              <Tooltip
                formatter={(valor, nombre) => [`${valor.toFixed(2)}%`, nombre === "personal" ? "Tu canasta" : "INPC general"]}
                labelFormatter={(mes) => `Mes ${mes}`}
              />
              <Line type="monotone" dataKey="personal" name="personal" stroke="var(--alerta)" strokeWidth={1.8} dot={false} />
              <Line type="monotone" dataKey="general" name="general" stroke="var(--azul-apagado)" strokeWidth={1.8} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="columnas">
        <section className="panel" aria-label="Desglose de tu canasta">
          <h3>Tu canasta de gasto</h3>
          <ul className="canasta-barras">
            {canastaOrdenada.map(([rubro, peso]) => (
              <li key={rubro}>
                <div className="canasta-fila">
                  <span>{ETIQUETAS_RUBRO[rubro] ?? rubro}</span>
                  <span className="num">{fmtPct(peso)}</span>
                </div>
                <div className="barra-fondo">
                  <div className="barra-lleno" style={{ width: `${(peso / maxPeso) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <Canasta
          pesos={pesos}
          onConfirmar={onCanasta}
          ocupado={ocupadoEditor}
          error={errorEditor}
        />
      </div>
    </div>
  );
}
