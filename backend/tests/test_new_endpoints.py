from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import TICKERS

pytestmark = pytest.mark.usefixtures("cache_sintetico")
client = TestClient(app)


def test_endpoint_rebalance():
    payload = {
        "capital_total": 150000.0,
        "portafolio_actual": {TICKERS[0]: 150000.0},
        "target_weights": [1.0 / len(TICKERS)] * len(TICKERS),
        "comision_broker_pct": 0.0025,
        "umbral_drift": 0.05,
    }
    resp = client.post("/portfolio/rebalance", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["capital_total"] == 150000.0
    assert data["requiere_rebalanceo"] is True
    assert len(data["ordenes"]) == len(TICKERS)


def test_endpoint_backtest():
    payload = {
        "pesos": {"alimentos": 0.35, "vivienda": 0.25, "transporte": 0.15, "salud": 0.10, "educacion": 0.05, "otros": 0.10},
        "optimal_weights": [1.0 / len(TICKERS)] * len(TICKERS),
        "meses_ventana": 24,
    }
    resp = client.post("/portfolio/backtest", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["meses_evaluados"] == 24
    assert len(data["estrategias"]) >= 4


def test_endpoint_stress():
    payload = {
        "pesos": {"alimentos": 0.35, "vivienda": 0.25, "transporte": 0.15, "salud": 0.10, "educacion": 0.05, "otros": 0.10},
        "optimal_weights": [1.0 / len(TICKERS)] * len(TICKERS),
    }
    resp = client.post("/stress/simulate", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["escenarios"]) == 5
    assert "escenario_mas_vulnerable" in data


def test_endpoint_insights():
    payload = {
        "transacciones": [
            {"fecha": "2026-03-01", "descripcion": "OXXO CHIPS", "monto": 30.0, "rubro": "alimentos"},
            {"fecha": "2026-03-02", "descripcion": "NETFLIX", "monto": 219.0, "rubro": "otros"},
            {"fecha": "2026-03-03", "descripcion": "SUELDO", "monto": -15000.0, "rubro": "otros"},
        ],
        "umbral_hormiga": 100.0,
    }
    resp = client.post("/statement/insights", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["gastos_hormiga_total"] == 30.0
    assert len(data["suscripciones"]) >= 1


def test_endpoint_report_executive():
    payload = {
        "pesos": {"alimentos": 0.35, "vivienda": 0.25, "transporte": 0.15, "salud": 0.10, "educacion": 0.05, "otros": 0.10},
        "buffer": 0.10,
        "capital_total": 200000.0,
        "horizonte": 12,
        "transacciones": [],
    }
    resp = client.post("/report/executive", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "perfil_inversionista" in data
    assert "kpis_clave" in data
    assert len(data["composicion_optima"]) > 0
    assert len(data["plan_accion_recomendado"]) > 0


def test_endpoint_system_diagnostics():
    resp = client.get("/system/diagnostics")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "OPERATIONAL"
    assert "market_data" in data
    assert "liability_data" in data
    assert len(data["models_available"]) >= 6
