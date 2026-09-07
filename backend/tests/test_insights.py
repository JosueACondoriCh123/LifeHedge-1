from __future__ import annotations

import pytest
from app.insights import analizar_insights_transacciones


def test_insights_vacio():
    res = analizar_insights_transacciones([])
    assert res.total_egresos == 0.0
    assert res.total_ingresos == 0.0
    assert res.gastos_hormiga_total == 0.0
    assert res.suscripciones == []


def test_insights_detecta_hormiga_y_suscripciones():
    txs = [
        {"descripcion": "OXXO CAFÉ Y PAN", "monto": 45.0, "rubro": "alimentos"},
        {"descripcion": "OXXO REFRESCO", "monto": 35.0, "rubro": "alimentos"},
        {"descripcion": "NETFLIX MENSUAL", "monto": 219.0, "rubro": "otros"},
        {"descripcion": "SPOTIFY PREMIUM", "monto": 129.0, "rubro": "otros"},
        {"descripcion": "DEPÓSITO NÓMINA", "monto": -25000.0, "rubro": "otros"},
        {"descripcion": "LIVERPOOL COMPRA", "monto": 3500.0, "rubro": "otros"},
    ]

    res = analizar_insights_transacciones(txs, umbral_hormiga=100.0)

    assert res.total_egresos == 45.0 + 35.0 + 219.0 + 129.0 + 3500.0
    assert res.total_ingresos == 25000.0
    assert res.gastos_hormiga_total == 80.0
    assert len(res.suscripciones) >= 2

    nombres_servicios = [s.servicio for s in res.suscripciones]
    assert any("NETFLIX" in s for s in nombres_servicios)
    assert any("SPOTIFY" in s for s in nombres_servicios)
    assert len(res.top_comercios) > 0
