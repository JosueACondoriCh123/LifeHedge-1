from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.coupling import calcular_matriz_acoplamiento, generar_cartera_base_inegi
from app.config import TICKERS, RUBROS
from app.main import app, _datos

pytestmark = pytest.mark.usefixtures("cache_sintetico")
client = TestClient(app)


def test_calcular_matriz_acoplamiento():
    market, inpc, _, _ = _datos()
    resultado = calcular_matriz_acoplamiento(market, inpc)

    assert "matriz_correlacion" in resultado
    assert "volatilidades_activos" in resultado
    assert "volatilidades_rubros" in resultado
    assert len(resultado["activos"]) == len(TICKERS)
    assert len(resultado["rubros"]) >= len(RUBROS)

    for ticker, rubros_dict in resultado["matriz_correlacion"].items():
        assert ticker in TICKERS
        for rubro, corr in rubros_dict.items():
            assert -1.0 <= corr <= 1.0

    for ticker, vol in resultado["volatilidades_activos"].items():
        assert vol > 0


def test_generar_cartera_base_inegi():
    market, inpc, _, _ = _datos()
    resultado = generar_cartera_base_inegi(market, inpc, buffer=0.10, horizonte_meses=12)

    assert "pesos" in resultado
    assert "inflacion" in resultado
    assert "optimo" in resultado
    assert "riesgo" in resultado

    assert pytest.approx(sum(resultado["pesos"].values()), 0.01) == 1.0

    optimo = resultado["optimo"]
    assert len(optimo["weights"]) == len(TICKERS)
    assert pytest.approx(sum(optimo["weights"]), 0.01) == 1.0
    assert optimo["tev"] >= 0.0
    assert 0.0 <= optimo["phe"] <= 1.0

    riesgo = resultado["riesgo"]
    assert "percentiles" in riesgo
    assert "var_95" in riesgo


def test_endpoint_market_coupling():
    resp = client.get("/market/coupling")
    assert resp.status_code == 200
    data = resp.json()
    assert "matriz_correlacion" in data
    assert "volatilidades_activos" in data
    assert len(data["activos"]) == 8


def test_endpoint_portfolio_baseline():
    resp = client.get("/portfolio/baseline?buffer=0.10&horizonte=12")
    assert resp.status_code == 200
    data = resp.json()
    assert "pesos" in data
    assert "optimo" in data
    assert "riesgo" in data
    assert len(data["optimo"]["weights"]) == 8


def test_endpoint_diagnostico_ping():
    resp = client.get("/api/diagnostico/ping")
    assert resp.status_code == 200
    data = resp.json()
    assert data["sistema_operativo"] is True
    assert len(data["endpoints"]) >= 5
    for ep in data["endpoints"]:
        assert ep["latencia_ms"] > 0
        assert ep["status"] in ("Operativo", "Degradado")
