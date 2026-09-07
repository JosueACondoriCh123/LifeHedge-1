from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.coupling import generar_escenarios_comparativos
from app.main import app, _datos

pytestmark = pytest.mark.usefixtures("cache_sintetico")
client = TestClient(app)


def test_generar_escenarios_comparativos_calculo():
    market, inpc, _, _ = _datos()
    escenarios = generar_escenarios_comparativos(market, inpc, buffer=0.10, horizonte_meses=12)

    assert len(escenarios) == 4
    ids = [e["id"] for e in escenarios]
    assert "esc-base" in ids
    assert "esc-alimentos" in ids
    assert "esc-dolar" in ids
    assert "esc-tasas" in ids

    for esc in escenarios:
        assert isinstance(esc["delta_anualizado"], float)
        assert 0.0 <= esc["phe"] <= 1.0
        assert esc["tev"] >= 0.0
        assert isinstance(esc["pesos"], dict)
        assert abs(sum(esc["pesos"].values()) - 1.0) < 0.02
        assert "optimo" in esc
        assert abs(sum(esc["optimo"]["weights"]) - 1.0) < 0.02
        assert "riesgo" in esc
        assert "var_95" in esc["riesgo"]


def test_endpoint_scenarios_comparative():
    resp = client.get("/scenarios/comparative?buffer=0.10&horizonte=12")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 4
    for esc in data:
        assert "id" in esc
        assert "etiqueta" in esc
        assert "categoria" in esc
        assert "delta_anualizado" in esc
        assert "phe" in esc
        assert "tev" in esc
        assert "optimo" in esc
        assert "riesgo" in esc
