import "../estilos/landing.css";

function LogoLifeHedge() {
  return (
    <span className="landing-brand" aria-label="LifeHedge">
      <img src="/logo.png" alt="LifeHedge Logo" className="landing-brand-logo-img" />
      <span>
        <strong>LifeHedge</strong>
        <small>LDI WEALTH OS</small>
      </span>
    </span>
  );
}

function IconoFlecha() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

function MundoCuantitativo() {
  return (
    <div className="landing-visual" aria-label="Red financiera global y análisis cuantitativo animado">
      <div className="landing-visual-bar">
        <span><i /> MOTOR LDI · LISTO</span>
        <span className="landing-visual-time">MODELO 06 · MX</span>
      </div>

      <div className="landing-map-stage">
        <div className="landing-map-orbit landing-map-orbit-a" />
        <div className="landing-map-orbit landing-map-orbit-b" />
        <svg className="landing-world" viewBox="0 0 900 440" role="img" aria-label="Mapa mundial de puntos">
          <defs>
            <pattern id="landing-dots" width="11" height="11" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="1.65" fill="currentColor" />
            </pattern>
            <filter id="landing-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g className="landing-world-land">
            <path d="M58 104 92 66l74-25 78 18 49 42-20 33-42 3-20 30-35 13-18 43-31-9-7-49-37-16Z" />
            <path d="m210 221 47 10 30 39-7 55-28 66-24-19 3-43-25-39-12-42Z" />
            <path d="m391 93 45-20 43 8 28-17 102 12 67 35 84 7 77 53-29 31-60 2-35 34-42-14-35 23-29-15-32-42-43 4-33-24-39-2-20-29-38-13Z" />
            <path d="m455 211 50-8 43 28 17 62-36 86-39-11-18-55-34-45Z" />
            <path d="m720 310 51-25 58 24 12 41-41 24-66-14Z" />
          </g>

          <g className="landing-network" filter="url(#landing-glow)">
            <path d="M161 132C280 66 348 180 451 148S652 91 767 185" />
            <path d="M246 264C352 219 409 236 501 267s183 74 286 62" />
            <path d="M451 148c-32 62-24 105 50 119" />
            <circle cx="161" cy="132" r="5" />
            <circle cx="246" cy="264" r="4" />
            <circle cx="451" cy="148" r="6" />
            <circle cx="501" cy="267" r="5" />
            <circle cx="767" cy="185" r="5" />
            <circle cx="787" cy="329" r="4" />
          </g>
        </svg>

        <div className="landing-scan-line" />

        <div className="landing-float-card landing-float-card-risk">
          <span>COBERTURA ESTIMADA</span>
          <strong>81.0%</strong>
          <small><i /> Optimización activa</small>
        </div>

        <div className="landing-float-card landing-float-card-index">
          <span>ÍNDICE PERSONAL</span>
          <strong>105.04</strong>
          <svg viewBox="0 0 180 48" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="landing-chart-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#58b7ff" stopOpacity=".35" />
                <stop offset="1" stopColor="#58b7ff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="landing-mini-area" d="M0 43 0 36 18 34 35 37 52 25 69 29 88 17 106 23 124 12 143 15 161 7 180 10 180 48Z" />
            <path className="landing-mini-line" d="M0 36 18 34 35 37 52 25 69 29 88 17 106 23 124 12 143 15 161 7 180 10" />
          </svg>
        </div>

        <div className="landing-coordinate">19.4326° N · 99.1332° W</div>
      </div>
    </div>
  );
}

const capacidades = [
  {
    numero: "01",
    titulo: "Inflación verdaderamente personal",
    texto: "Transforma la composición de tu gasto en una trayectoria propia y compárala con el INPC oficial.",
    etiqueta: "INEGI + CANASTA REAL",
  },
  {
    numero: "02",
    titulo: "Cobertura optimizada",
    texto: "Construye una cartera LDI que minimiza el desajuste entre tus activos y el costo futuro de tu vida.",
    etiqueta: "OPTIMIZACIÓN CONVEXA",
  },
  {
    numero: "03",
    titulo: "Riesgo visible antes de decidir",
    texto: "Explora percentiles, VaR y escenarios de estrés con simulaciones que preservan el contexto económico.",
    etiqueta: "MERTON MONTE CARLO",
  },
];

export default function Landing({ onExplorar, onAnalizar, onAcceso, onRegistro }) {
  return (
    <div className="landing-shell">
      <a className="landing-skip" href="#contenido-landing">Saltar al contenido</a>

      <header className="landing-nav">
        <button type="button" className="landing-logo-button" onClick={onExplorar}>
          <LogoLifeHedge />
        </button>
        <nav aria-label="Navegación principal">
          <a href="#metodo">Método</a>
          <a href="#capacidades">Capacidades</a>
          <a href="#seguridad">Riesgo</a>
        </nav>
        <div className="landing-nav-actions">
          <button
            type="button"
            className="landing-nav-login"
            onClick={onAcceso}
          >
            Iniciar Sesión
          </button>
          <button type="button" className="landing-nav-cta" onClick={onRegistro || onAcceso}>
            Crear Cuenta <IconoFlecha />
          </button>
        </div>
      </header>

      <main id="contenido-landing">
        <section className="landing-hero">
          <div className="landing-grid" aria-hidden="true" />
          <div className="landing-noise" aria-hidden="true" />
          <div className="landing-hero-glow landing-hero-glow-a" aria-hidden="true" />
          <div className="landing-hero-glow landing-hero-glow-b" aria-hidden="true" />

          <div className="landing-hero-copy">
            <div className="landing-eyebrow">
              <span /> Inteligencia patrimonial para México
            </div>
            <h1>
              Protege tu poder adquisitivo.
              <em>No solo tu portafolio.</em>
            </h1>
            <p>
              LifeHedge conecta tu gasto real con una estrategia de inversión guiada por pasivos,
              diseñada para medir, cubrir y anticipar tu inflación personal.
            </p>
            <div className="landing-hero-actions">
              <button type="button" className="landing-button-primary" onClick={onExplorar}>
                Explorar plataforma <IconoFlecha />
              </button>
              <button type="button" className="landing-button-secondary" onClick={onAnalizar}>
                Analizar mi canasta
              </button>
            </div>
            <div className="landing-trust-line">
              <span><i /> Datos oficiales</span>
              <span>INEGI</span>
              <span>BANXICO</span>
              <span>MODELOS LDI</span>
            </div>
          </div>

          <MundoCuantitativo />

          <div className="landing-scroll-cue" aria-hidden="true">
            <span>DESCUBRIR</span><i />
          </div>
        </section>

        <section className="landing-metrics" aria-label="Capacidades del motor">
          <div><strong>6</strong><span>rubros de gasto</span></div>
          <div><strong>8</strong><span>activos de cobertura</span></div>
          <div><strong>1,000</strong><span>trayectorias por escenario</span></div>
          <div><strong>24/7</strong><span>lectura de riesgo</span></div>
        </section>

        <section className="landing-method" id="metodo">
          <div className="landing-section-heading">
            <span>UNA NUEVA UNIDAD DE MEDIDA</span>
            <h2>Tu vida financiera merece un índice propio.</h2>
          </div>
          <div className="landing-method-copy">
            <p>
              Los indicadores generales cuentan la historia del país. LifeHedge modela la tuya:
              vivienda, alimentos, transporte, salud, educación y consumo, ponderados según cómo vives.
            </p>
            <div className="landing-formula">
              <span>OBJETIVO LDI</span>
              <code>min wᵀΣw − 2wᵀσ</code>
              <small>sujeto a liquidez, diversificación y exposición real</small>
            </div>
          </div>
        </section>

        <section className="landing-capabilities" id="capacidades">
          <div className="landing-section-heading compact">
            <span>DEL DATO A LA DECISIÓN</span>
            <h2>Un sistema cuantitativo que se entiende.</h2>
          </div>
          <div className="landing-capability-grid">
            {capacidades.map((capacidad) => (
              <article key={capacidad.numero} className="landing-capability-card">
                <div className="landing-card-topline">
                  <span>{capacidad.numero}</span>
                  <i />
                  <small>{capacidad.etiqueta}</small>
                </div>
                <h3>{capacidad.titulo}</h3>
                <p>{capacidad.texto}</p>
                <div className="landing-card-signal" aria-hidden="true">
                  {Array.from({ length: 14 }, (_, i) => <span key={i} />)}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-risk" id="seguridad">
          <div className="landing-risk-visual" aria-hidden="true">
            <div className="landing-risk-axis" />
            <div className="landing-risk-band landing-risk-band-outer" />
            <div className="landing-risk-band landing-risk-band-inner" />
            <svg viewBox="0 0 700 260" preserveAspectRatio="none">
              <path d="M0 192C75 176 108 196 167 151s109-12 162-47 91 7 146-28 103-9 225-54" />
            </svg>
          </div>
          <div className="landing-risk-copy">
            <span className="landing-kicker">RIESGO CON CONTEXTO</span>
            <h2>Ve el rango completo, no una promesa perfecta.</h2>
            <p>
              Cada proyección muestra escenarios centrales y extremos. Así puedes decidir con una
              lectura honesta de la incertidumbre, el déficit potencial y la liquidez disponible.
            </p>
            <button type="button" className="landing-text-link" onClick={onExplorar}>
              Ver simulador de riesgo <IconoFlecha />
            </button>
          </div>
        </section>

        <section className="landing-final-cta">
          <div>
            <span>EMPIEZA CON TU REALIDAD</span>
            <h2>Convierte tus gastos en una estrategia.</h2>
          </div>
          <button type="button" className="landing-button-primary" onClick={onAnalizar}>
            Construir mi cobertura <IconoFlecha />
          </button>
        </section>
      </main>

      <footer className="landing-footer">
        <LogoLifeHedge />
        <p>Plataforma de análisis educativo. Las proyecciones no garantizan rendimientos.</p>
        <span>© 2026 LifeHedge</span>
      </footer>
    </div>
  );
}
