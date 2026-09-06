import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useSesion } from "../auth/SesionProvider.jsx";
import { leerAnalisis, listarAnalisis } from "../datos/analisis.js";
import { fmtFecha, fmtPct, fmtPctConSigno, fmtPuntos } from "../formato.js";
import { ETIQUETAS_RUBRO, RUBROS } from "../rubros.js";

// Par validado: pasa banda de luminosidad, piso de croma, separación en
// daltonismo, piso de visión normal y contraste. No los cambies sin volver
// a validar; en particular, nunca pongas juntos rojo y naranja.
const COLOR_A = "var(--serie-cartera)";
const COLOR_B = "var(--serie-efectivo)";

/** Métricas enfrentadas. `mejorSi` dice qué dirección es buena. */
const METRICAS = [
  {
    clave: "delta",
    etiqueta: "Delta de Divergencia",
    leer: (a) => a.delta_anualizado ?? a.inflacion?.delta_anualizado,
    formato: fmtPctConSigno,
    mejorSi: "menor",
  },
  {
    clave: "phe",
    etiqueta: "Eficiencia de cobertura",
    leer: (a) => a.phe ?? a.optimo?.phe,
    formato: fmtPct,
    mejorSi: "mayor",
  },
  {
    clave: "tev",
    etiqueta: "Tracking error",
    leer: (a) => a.tev ?? a.optimo?.tev,
    formato: fmtPct,
    mejorSi: "menor",
  },
  {
    clave: "var",
    etiqueta: "VaR 95%",
    leer: (a) => a.riesgo?.var_95,
    formato: fmtPct,
    mejorSi: "menor",
  },
];

export default function Comparar() {
  const { sesion } = useSesion();

  const [opciones, setOpciones] = useState([]);
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sesion) return;
    listarAnalisis()
      .then((filas) => {
        setOpciones(filas);
        if (filas[0]) setIdA(filas[0].id);
        if (filas[1]) setIdB(filas[1].id);
      })
      .catch((e) => setError(e.message));
  }, [sesion]);

  useEffect(() => {
    if (!idA) return;
    leerAnalisis(idA).then(setA).catch((e) => setError(e.message));
  }, [idA]);

  useEffect(() => {
    if (!idB) return;
    leerAnalisis(idB).then(setB).catch((e) => setError(e.message));
  }, [idB]);

  const canasta = useMemo(() => {
    if (!a || !b) return [];
    return RUBROS.map((rubro) => ({
      rubro: ETIQUETAS_RUBRO[rubro],
      A: (a.pesos?.[rubro] ?? 0) * 100,
      B: (b.pesos?.[rubro] ?? 0) * 100,
    }));
  }, [a, b]);

  const cartera = useMemo(() => {
    if (!a?.optimo?.assets || !b?.optimo?.weights) return [];
    return a.optimo.assets.map((activo, i) => ({
      etiqueta: activo.label,
      ticker: activo.ticker,
      pesoA: a.optimo.weights[i] ?? 0,
      pesoB: b.optimo.weights[i] ?? 0,
    }));
  }, [a, b]);

  if (!sesion) {
    return (
      <section className="vista">
        <h2>Comparar</h2>
        <div className="panel estado-vacio">
          <p>Inicia sesión para comparar análisis guardados.</p>
        </div>
      </section>
    );
  }

  if (opciones.length < 2) {
    return (
      <section className="vista">
        <h2>Comparar</h2>
        <div className="panel estado-vacio">
          <p>
            Necesitas al menos dos análisis guardados para compararlos. Guarda otro mes
            y vuelve aquí.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="vista">
      <div className="vista__encabezado">
        <h2>Comparar escenarios</h2>
      </div>

      {error ? (
        <div className="panel panel-error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <div className="comparar-selectores">
        <label className="campo">
          <span>
            <i className="muestra-color" style={{ background: COLOR_A }} /> Análisis A
          </span>
          <select value={idA} onChange={(e) => setIdA(e.target.value)}>
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.etiqueta} · {fmtFecha(o.creado_en)}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>
            <i className="muestra-color" style={{ background: COLOR_B }} /> Análisis B
          </span>
          <select value={idB} onChange={(e) => setIdB(e.target.value)}>
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.etiqueta} · {fmtFecha(o.creado_en)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {a && b ? (
        <>
          <div className="tabla-desplazable">
            <table className="tabla tabla-comparacion">
              <thead>
                <tr>
                  <th>Métrica</th>
                  <th>{a.etiqueta}</th>
                  <th>{b.etiqueta}</th>
                  <th>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {METRICAS.map((m) => {
                  const va = m.leer(a);
                  const vb = m.leer(b);
                  if (typeof va !== "number" || typeof vb !== "number") return null;
                  const dif = vb - va;
                  const mejora = m.mejorSi === "mayor" ? dif > 0 : dif < 0;
                  return (
                    <tr key={m.clave}>
                      <td>{m.etiqueta}</td>
                      <td>{m.formato(va)}</td>
                      <td>{m.formato(vb)}</td>
                      <td className={mejora ? "cifra-positiva" : "cifra-alerta"}>
                        {mejora ? "▲" : "▼"} {fmtPuntos(Math.abs(dif))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <section className="panel-grafica">
            <h3>Canasta de gasto</h3>
            <div className="alto-grafica">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={canasta} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="var(--linea)" vertical={false} />
                  <XAxis
                    dataKey="rubro"
                    tick={{ fontSize: 12, fill: "var(--tinta-suave)" }}
                    stroke="var(--linea)"
                    tickLine={false}
                  />
                  <YAxis
                    unit="%"
                    tick={{ fontSize: 12, fill: "var(--tinta-suave)" }}
                    stroke="var(--linea)"
                    tickLine={false}
                  />
                  <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                  <Bar dataKey="A" name={a.etiqueta} fill={COLOR_A} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="B" name={b.etiqueta} fill={COLOR_B} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="leyenda">
              <li>
                <i className="muestra" style={{ background: COLOR_A }} /> {a.etiqueta}
              </li>
              <li>
                <i className="muestra" style={{ background: COLOR_B }} /> {b.etiqueta}
              </li>
            </ul>
          </section>

          <h3>Cartera sugerida</h3>
          <div className="tabla-desplazable">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Activo</th>
                  <th>Ticker</th>
                  <th>{a.etiqueta}</th>
                  <th>{b.etiqueta}</th>
                  <th>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {cartera.map((fila) => {
                  const dif = fila.pesoB - fila.pesoA;
                  return (
                    <tr key={fila.ticker}>
                      <td>{fila.etiqueta}</td>
                      <td>{fila.ticker}</td>
                      <td>{fmtPct(fila.pesoA)}</td>
                      <td>{fmtPct(fila.pesoB)}</td>
                      <td className={Math.abs(dif) < 0.005 ? "cifra-tenue" : undefined}>
                        {dif >= 0 ? "+" : "−"}
                        {fmtPuntos(Math.abs(dif))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="pie-metodo">
            Todo se calcula sobre los análisis guardados, sin volver a llamar al motor.
            Por eso responde al instante aunque el backend esté dormido.
          </p>
        </>
      ) : null}
    </section>
  );
}
