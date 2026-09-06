import pytest

from app.config import RUBROS
from app.inpc import InpcData
from app.liability import serie_personal, validar_pesos


def _inpc(n=12, valor_rubro=0.01, valor_general=0.005):
    return InpcData(
        dates=[f"2025-{m:02d}" for m in range(1, n + 1)],
        series={
            "general": [valor_general] * n,
            **{r: [valor_rubro] * n for r in RUBROS},
        },
        stale=False,
        as_of="2026-01-01T00:00:00",
    )


def _pesos_uniformes():
    return {r: 1 / len(RUBROS) for r in RUBROS}


def test_validar_pesos_normaliza_a_uno():
    pesos = validar_pesos({r: 2.0 for r in RUBROS})

    assert abs(sum(pesos.values()) - 1.0) < 1e-9


def test_validar_pesos_rechaza_rubro_faltante():
    incompletos = {r: 0.2 for r in RUBROS[:-1]}

    with pytest.raises(ValueError):
        validar_pesos(incompletos)


def test_validar_pesos_rechaza_negativos():
    pesos = {r: 0.2 for r in RUBROS}
    pesos["salud"] = -0.1

    with pytest.raises(ValueError):
        validar_pesos(pesos)


def test_serie_personal_es_la_combinacion_ponderada():
    # Todos los rubros suben 1% al mes; la inflación personal debe ser 1% al mes.
    resultado = serie_personal(_pesos_uniformes(), _inpc())

    assert len(resultado.personal) == 12
    assert all(abs(v - 0.01) < 1e-12 for v in resultado.personal)


def test_delta_anualizado_es_la_brecha_contra_el_general():
    # Personal 1% mensual, general 0.5% mensual → delta = 0.5% * 12 = 6%.
    resultado = serie_personal(_pesos_uniformes(), _inpc())

    assert abs(resultado.delta_anualizado - 0.06) < 1e-9
    assert abs(resultado.personal_anual - 0.12) < 1e-9
    assert abs(resultado.general_anual - 0.06) < 1e-9


def test_volatilidad_es_cero_en_una_serie_constante():
    resultado = serie_personal(_pesos_uniformes(), _inpc())

    assert abs(resultado.volatilidad_anual) < 1e-12
