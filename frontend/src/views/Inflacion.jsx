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
import { useLanguage } from "../i18n/LanguageContext.jsx";

function Delta({ inflacion, t }) {
  const positivo = inflacion.delta_anualizado > 0;
  return (
    <MetricCard
      etiqueta={t("inflacion.divergenceDelta")}
      valor={fmtPctDetallado(inflacion.delta_anualizado)}
      tono={positivo ? "alerta" : "positivo"}
      nota={
        positivo
          ? t("inflacion.moreInflation")
          : t("inflacion.lessInflation")
      }
      destacada
    />
  );
}

function Canasta({ pesos, onConfirmar, ocupado, error, t }) {
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
    <section className="panel-editor" aria-label={t("inflacion.adjustBasketTitle")}>
      <h3>{t("inflacion.adjustBasketTitle")}</h3>
      <p className="panel-nota">
        {t("inflacion.adjustBasketSubtitle")}
      </p>
      <div className="editor-sliders">
        {RUBROS.map((r) => (
          <label key={r} className="editor-fila">
            <span>{t("rubros." + r, {}, ETIQUETAS_RUBRO[r])}</span>
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
        {ocupado ? t("inflacion.recalculating") : t("inflacion.recalculateBtn")}
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
  const { t } = useLanguage();

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
        <h2>{t("inflacion.title")}</h2>
        <StaleBadge stale={inflacion.stale} asOf={inflacion.as_of} />
      </div>

      <div className="rejilla-metricas cuatro">
        <MetricCard
          etiqueta={t("inflacion.annualInflation")}
          valor={fmtPct(inflacion.personal_anual)}
          nota={t("inflacion.basketNote")}
        />
        <MetricCard
          etiqueta={t("inflacion.officialInpc")}
          valor={fmtPct(inflacion.general_anual)}
          nota={t("inflacion.nationalAvg")}
        />
        <Delta inflacion={inflacion} t={t} />
        <MetricCard
          etiqueta={t("inflacion.basketVolatility")}
          valor={fmtPct(inflacion.volatilidad_anual)}
          nota={t("inflacion.annualVariation")}
        />
      </div>

      <section className="panel-grafica" aria-label={t("inflacion.monthlyChartTitle")}>
        <h3>{t("inflacion.monthlyChartTitle")}</h3>
        <div className="alto-grafica">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--linea)" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="mes" minTickGap={40} tick={{ fontSize: 12 }} stroke="var(--tinta-suave)" tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="var(--tinta-suave)"
                tickFormatter={(v) => `${v.toFixed(1)}%`}
                width={52}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(valor, nombre) => [
                  `${valor.toFixed(2)}%`,
                  nombre === "personal" ? t("inflacion.yourBasketLabel") : t("inflacion.cpiLabel"),
                ]}
                labelFormatter={(mes) => `${t("inflacion.monthPrefix")} ${mes}`}
              />
              <Line type="linear" dataKey="personal" name="personal" stroke="var(--alerta)" strokeWidth={2.1} dot={false} activeDot={{ r: 4 }} />
              <Line type="linear" dataKey="general" name="general" stroke="var(--azul-apagado)" strokeWidth={2.1} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="columnas">
        <section className="panel" aria-label={t("inflacion.spendingBasketTitle")}>
          <h3>{t("inflacion.spendingBasketTitle")}</h3>
          <ul className="canasta-barras">
            {canastaOrdenada.map(([rubro, peso]) => (
              <li key={rubro}>
                <div className="canasta-fila">
                  <span>{t("rubros." + rubro, {}, ETIQUETAS_RUBRO[rubro] ?? rubro)}</span>
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
          t={t}
        />
      </div>
    </div>
  );
}
