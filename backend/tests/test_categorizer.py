import pytest

from app.categorizer import categorizar, pesos_por_rubro
from app.config import RUBROS


@pytest.mark.parametrize(
    "descripcion,esperado",
    [
        ("OXXO SUC 1234 CULIACAN", "alimentos"),
        ("SORIANA HIPER", "alimentos"),
        ("CFE SUMINISTRO BASICO", "vivienda"),
        ("RENTA DEPARTAMENTO", "vivienda"),
        ("UBER TRIP", "transporte"),
        ("GASOLINERA PEMEX 4411", "transporte"),
        ("FARMACIA GUADALAJARA", "salud"),
        ("COLEGIATURA UNIVERSIDAD", "educacion"),
        ("COPPEL ABONO", "otros"),
    ],
)
def test_categorizar_asigna_el_rubro_correcto(descripcion, esperado):
    assert categorizar(descripcion) == esperado


def test_comercio_desconocido_cae_en_otros():
    assert categorizar("ZZZ COMERCIO NO REGISTRADO 999") == "otros"


def test_categorizar_es_insensible_a_mayusculas_y_acentos():
    assert categorizar("farmacia san pablo") == "salud"
    assert categorizar("Colegiatura Instituto") == "educacion"


def test_pesos_por_rubro_suman_uno_y_cubren_todos_los_rubros():
    transacciones = [
        ("OXXO SUC 1", 300.0),
        ("SORIANA", 700.0),
        ("CFE", 1000.0),
    ]

    pesos = pesos_por_rubro(transacciones)

    assert set(pesos) == set(RUBROS)
    assert abs(sum(pesos.values()) - 1.0) < 1e-9
    assert abs(pesos["alimentos"] - 0.5) < 1e-9
    assert abs(pesos["vivienda"] - 0.5) < 1e-9
    assert pesos["salud"] == 0.0


def test_pesos_ignoran_montos_no_positivos():
    transacciones = [("OXXO", 100.0), ("PAGO RECIBIDO", -500.0), ("CFE", 0.0)]

    pesos = pesos_por_rubro(transacciones)

    assert abs(pesos["alimentos"] - 1.0) < 1e-9


def test_sin_transacciones_validas_levanta():
    with pytest.raises(ValueError):
        pesos_por_rubro([("PAGO RECIBIDO", -100.0)])
