from __future__ import annotations

import pytest
from app.config import TICKERS
from app.rebalance import calcular_rebalanceo


def test_rebalance_capital_invalido_falla():
    with pytest.raises(ValueError, match="capital total debe ser mayor a cero"):
        calcular_rebalanceo(
            capital_total=0.0,
            portafolio_actual={},
            target_weights=[1.0 / len(TICKERS)] * len(TICKERS),
        )


def test_rebalance_pesos_incompletos_falla():
    with pytest.raises(ValueError, match="pesos objetivo"):
        calcular_rebalanceo(
            capital_total=100000.0,
            portafolio_actual={},
            target_weights=[0.5, 0.5],
        )


def test_rebalance_sin_drift_no_requiere_rebalanceo():
    capital = 100000.0
    pesos_obj = [1.0 / len(TICKERS)] * len(TICKERS)
    portafolio = {t: capital * pesos_obj[i] for i, t in enumerate(TICKERS)}

    res = calcular_rebalanceo(
        capital_total=capital,
        portafolio_actual=portafolio,
        target_weights=pesos_obj,
        umbral_drift=0.05,
    )

    assert not res.requiere_rebalanceo
    assert res.drift_score == pytest.approx(0.0, abs=1e-4)
    assert res.monto_compras_total == 0.0
    assert res.monto_ventas_total == 0.0
    assert all(o.accion == "MANTENER" for o in res.ordenes)


def test_rebalance_con_drift_genera_compras_y_ventas():
    capital = 100000.0
    portafolio = {TICKERS[0]: capital}
    pesos_obj = [1.0 / len(TICKERS)] * len(TICKERS)

    res = calcular_rebalanceo(
        capital_total=capital,
        portafolio_actual=portafolio,
        target_weights=pesos_obj,
        umbral_drift=0.05,
    )

    assert res.requiere_rebalanceo
    assert res.drift_score > 0.05
    assert res.monto_ventas_total > 0
    assert res.monto_compras_total > 0
    assert any(o.accion == "VENTA" for o in res.ordenes)
    assert any(o.accion == "COMPRA" for o in res.ordenes)
    assert res.costo_comisiones_total > 0
