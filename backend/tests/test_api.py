from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient

from app.auth import usuario_actual
from app.config import RUBROS, TICKERS, settings
from app.main import app

client = TestClient(app)

# Todas las rutas leen mercado e INPC; el fixture apunta el caché a datos
# sintéticos para que la suite corra sin red ni tokens.
pytestmark = pytest.mark.usefixtures("cache_sintetico")


def _pesos_demo():
    return {r: 1 / len(RUBROS) for r in RUBROS}


RUTAS_PROTEGIDAS = (
    ("GET", "/market/universe"),
    ("POST", "/statement/parse"),
    ("POST", "/inflation/personal"),
    ("POST", "/portfolio/optimize"),
    ("POST", "/risk/simulate"),
    ("POST", "/analysis/run"),
)


@pytest.fixture
def autenticacion_real(monkeypatch):
    app.dependency_overrides.pop(usuario_actual, None)
    monkeypatch.setattr(settings, "supabase_jwt_secret", "secreto-de-prueba")


def test_health_reporta_ok():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "lifehedge"


@pytest.mark.parametrize(("metodo", "ruta"), RUTAS_PROTEGIDAS)
def test_ruta_de_datos_sin_autorizacion_devuelve_401(
    autenticacion_real,
    metodo,
    ruta,
):
    response = client.request(metodo, ruta)

    assert response.status_code == 401
    assert response.json()["detail"] == "Falta tu sesión. Vuelve a iniciar sesión."


@pytest.mark.parametrize(("metodo", "ruta"), RUTAS_PROTEGIDAS)
def test_ruta_de_datos_con_token_basura_devuelve_401(
    autenticacion_real,
    metodo,
    ruta,
):
    response = client.request(
        metodo,
        ruta,
        headers={"Authorization": "Bearer token-basura"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Sesión inválida."


def test_token_hs256_valido_permite_acceder(autenticacion_real):
    token = jwt.encode(
        {
            "sub": "00000000-0000-0000-0000-000000000002",
            "email": "persona@lifehedge.mx",
            "aud": "authenticated",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )

    response = client.get(
        "/market/universe",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200


def test_universe_devuelve_activos_en_orden_canonico():
    response = client.get("/market/universe")

    assert response.status_code == 200
    body = response.json()
    assert [a["ticker"] for a in body["assets"]] == list(TICKERS)
    assert "stale" in body and "as_of" in body


def test_statement_parse_con_pdf_de_muestra():
    pdf = (settings.samples_dir / "bbva_familia.pdf").read_bytes()

    response = client.post(
        "/statement/parse",
        files={"archivo": ("bbva_familia.pdf", pdf, "application/pdf")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["emisor"] == "BBVA"
    assert abs(sum(body["pesos"].values()) - 1.0) < 1e-6
    assert len(body["transacciones"]) > 0


def test_statement_parse_con_archivo_invalido_devuelve_422():
    response = client.post(
        "/statement/parse",
        files={"archivo": ("basura.pdf", b"no soy un pdf", "application/pdf")},
    )

    assert response.status_code == 422
    assert "detail" in response.json()


def test_inflation_personal_devuelve_delta():
    response = client.post("/inflation/personal", json={"pesos": _pesos_demo()})

    assert response.status_code == 200
    body = response.json()
    assert "delta_anualizado" in body
    assert len(body["dates"]) == len(body["personal"]) == len(body["general"])


def test_inflation_personal_con_rubro_faltante_devuelve_422():
    incompletos = {r: 0.2 for r in RUBROS[:-1]}

    response = client.post("/inflation/personal", json={"pesos": incompletos})

    assert response.status_code == 422


def test_optimize_devuelve_pesos_metricas_y_benchmark():
    response = client.post(
        "/portfolio/optimize", json={"pesos": _pesos_demo(), "buffer": 0.10}
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["weights"]) == len(TICKERS)
    assert abs(sum(body["weights"]) - 1.0) < 1e-6
    assert 0.0 <= body["phe"] <= 1.0
    assert "benchmark_cetes" in body
    assert len(body["frontera"]) > 0


def test_optimize_con_buffer_invalido_devuelve_422():
    response = client.post(
        "/portfolio/optimize", json={"pesos": _pesos_demo(), "buffer": 1.5}
    )

    assert response.status_code == 422


def test_el_optimo_cubre_mejor_que_solo_cetes():
    """El argumento de valor del producto, comprobado como test.

    En el fixture, la pata de udibonos sigue al INPC y energía y agro se mueven
    con los precios. Una cartera optimizada tiene que aprovechar eso y quedar
    por encima de dejar todo en cetes.
    """
    body = client.post(
        "/portfolio/optimize", json={"pesos": _pesos_demo(), "buffer": 0.10}
    ).json()

    assert body["phe"] > body["benchmark_cetes"]["phe"]
    assert body["tev"] < body["benchmark_cetes"]["tev"]


def test_con_fuentes_caidas_responde_desde_el_snapshot(cache_sintetico, monkeypatch):
    """Si Yahoo, Banxico o INEGI se caen, la API degrada en vez de romperse."""
    import app.inpc as inpc_mod
    import app.market_data as market_mod

    def caido():
        raise ConnectionError("fuente externa caída")

    monkeypatch.setattr(market_mod, "fetch_market_payload", caido)
    monkeypatch.setattr(inpc_mod, "fetch_inpc_payload", caido)
    for clave in ("market", "inpc"):
        (cache_sintetico["cache_dir"] / f"{clave}.json").unlink()

    response = client.post(
        "/portfolio/optimize", json={"pesos": _pesos_demo(), "buffer": 0.10}
    )

    assert response.status_code == 200
    assert response.json()["stale"] is True


def test_simulate_devuelve_percentiles_var_y_cvar():
    optimo = client.post(
        "/portfolio/optimize", json={"pesos": _pesos_demo(), "buffer": 0.10}
    ).json()

    response = client.post(
        "/risk/simulate",
        json={"pesos": _pesos_demo(), "weights": optimo["weights"], "horizonte": 12},
    )

    assert response.status_code == 200
    body = response.json()
    assert set(body["percentiles"]) == {"p5", "p25", "p50", "p75", "p95"}
    assert len(body["percentiles"]["p50"]) == 12
    assert body["cvar_95"] >= body["var_95"]


def test_analysis_run_equivale_a_las_tres_rutas_individuales():
    pesos = _pesos_demo()
    buffer = 0.10
    horizonte = 12

    inflacion = client.post("/inflation/personal", json={"pesos": pesos})
    optimo = client.post(
        "/portfolio/optimize",
        json={"pesos": pesos, "buffer": buffer},
    )
    riesgo = client.post(
        "/risk/simulate",
        json={
            "pesos": pesos,
            "weights": optimo.json()["weights"],
            "horizonte": horizonte,
        },
    )
    agregado = client.post(
        "/analysis/run",
        json={"pesos": pesos, "buffer": buffer, "horizonte": horizonte},
    )

    assert inflacion.status_code == 200
    assert optimo.status_code == 200
    assert riesgo.status_code == 200
    assert agregado.status_code == 200
    assert agregado.json() == {
        "inflacion": inflacion.json(),
        "optimo": optimo.json(),
        "riesgo": riesgo.json(),
    }
