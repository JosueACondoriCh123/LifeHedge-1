import Dropzone from "../components/Dropzone.jsx";

export default function Onboarding({ onPdf, onDemo, ocupado, error }) {
  return (
    <section className="onboarding">
      <div className="onboarding-intro">
        <img src="/logo.png" alt="LifeHedge Logo" className="onboarding-brand-logo" />
        <h1>Invierte contra la inflación de tu canasta</h1>
        <p className="propuesta">
          LifeHedge lee tu estado de cuenta, mide la inflación de tu canasta real y
          construye la cartera que la cubre.
        </p>
      </div>

      <div className="onboarding-caminos">
        <Dropzone onArchivo={onPdf} ocupado={ocupado} error={error} />

        <button
          type="button"
          className="boton-demo"
          onClick={onDemo}
          disabled={ocupado}
        >
          Usar un estado de cuenta demo
        </button>
      </div>

      <p className="nota-privacidad">
        Tu archivo se procesa y se descarta: no se guarda ni se comparte.
      </p>
    </section>
  );
}
