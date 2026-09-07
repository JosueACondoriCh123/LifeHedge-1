from __future__ import annotations

import pytest
import app.main as main
from app.config import TICKERS
from app.backtest import ejecutar_backtest
from app.market_data import load_market
from app.liability import serie_personal
from app.inpc import load_inpc

pytestmark = pytest.mark.usefixtures("cache_sintetico")


def test_backtest_ejecucion_correcta():
    market = load_market(main.cache)
    inpc = load_inpc(main.cache)
    pesos_gasto = {"alimentos": 0.35, "vivienda": 0.25, "transporte": 0.15, "salud": 0.10, "educacion": 0.05, "otros": 0.10}
    pasivo = serie_personal(pesos_gasto, inpc)

    optimal_weights = [1.0 / len(TICKERS)] * len(TICKERS)
    res = ejecutar_backtest(market, pasivo, optimal_weights, meses_ventana=24)

    assert res.meses_evaluados == 24
    assert len(res.fechas) == 25
    assert len(res.estrategias) >= 4

    estrategias_nombres = [e.nombre for e in res.estrategias]
    assert "lifehedge_optimo" in estrategias_nombres
    assert "solo_cetes" in estrategias_nombres
    assert "portafolio_60_40" in estrategias_nombres
    assert "inflacion_personal" in estrategias_nombres

    for est in res.estrategias:
        assert len(est.trayectoria_base100) == 25
        assert est.cagr is not None
        assert est.volatilidad_anual >= 0
        assert est.max_drawdown >= 0


def test_backtest_falla_con_pocos_meses():
    market = load_market(main.cache)
    inpc = load_inpc(main.cache)
    pesos_gasto = {"alimentos": 0.35, "vivienda": 0.25, "transporte": 0.15, "salud": 0.10, "educacion": 0.05, "otros": 0.10}
    pasivo = serie_personal(pesos_gasto, inpc)
    optimal_weights = [1.0 / len(TICKERS)] * len(TICKERS)

    res = ejecutar_backtest(market, pasivo, optimal_weights, meses_ventana=12)
    assert res.meses_evaluados == 12
