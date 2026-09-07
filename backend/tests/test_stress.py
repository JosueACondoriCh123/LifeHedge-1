from __future__ import annotations

import pytest
from app.config import TICKERS
from app.stress import simular_estres, simular_estres_macro, ESCENARIOS_MACRO


def test_stress_macro_evalua_todos_los_escenarios():
    pesos = [1.0 / len(TICKERS)] * len(TICKERS)
    res = simular_estres_macro(pesos)

    assert len(res) == len(ESCENARIOS_MACRO)
    for esc in res:
        assert esc.clave_escenario in ESCENARIOS_MACRO
        assert isinstance(esc.retorno_cartera_estres, float)
        assert isinstance(esc.delta_estresado, float)
        assert 0.0 <= esc.phe_estresado <= 1.0


def test_stress_falla_con_dimension_incorrecta():
    with pytest.raises(ValueError, match="pesos de cartera"):
        simular_estres_macro([0.5, 0.5])


def test_stress_simular_summary():
    pesos = [1.0 / len(TICKERS)] * len(TICKERS)
    summary = simular_estres(pesos)

    assert len(summary.escenarios) == len(ESCENARIOS_MACRO)
    assert summary.escenario_mas_vulnerable != ""
    assert summary.escenario_mas_favorable != ""
    assert 0.0 <= summary.resiliencia_promedio_cartera <= 1.0
