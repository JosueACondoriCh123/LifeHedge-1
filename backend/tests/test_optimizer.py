import numpy as np
import pytest

from app.optimizer import (
    Infactible,
    acoplamiento,
    frontera,
    metricas,
    optimizar,
)


def _caso_replicante():
    """Activo 0 replica el pasivo exactamente; los demás son ruido independiente.

    sigma_l2 = 0.0004 (vol mensual 2%).
    """
    sigma_l2 = 0.0004
    sigma_a = np.diag([sigma_l2, 0.0001, 0.0009])
    sigma_al = np.array([sigma_l2, 0.0, 0.0])
    return sigma_a, sigma_al, sigma_l2


def _fechas(n, desde=1):
    return [
        f"{2015 + (desde + i - 1) // 12:04d}-{((desde + i - 1) % 12) + 1:02d}"
        for i in range(n)
    ]


def test_el_optimo_se_concentra_en_el_activo_que_replica_el_pasivo():
    sigma_a, sigma_al, sigma_l2 = _caso_replicante()

    # cash_index = 0 para que el buffer no estorbe al activo replicante.
    resultado = optimizar(sigma_a, sigma_al, sigma_l2, cash_index=0, buffer=0.10)

    assert resultado.weights[0] > 0.99
    assert resultado.phe > 0.99
    # El desajuste residual debe ser ruido del solver: menos del 1% de la
    # volatilidad del propio pasivo, no un umbral absoluto arbitrario.
    assert resultado.tev < 0.01 * np.sqrt(sigma_l2 * 12)


def test_respeta_la_restriccion_de_buffer_de_efectivo():
    sigma_a, sigma_al, sigma_l2 = _caso_replicante()

    resultado = optimizar(sigma_a, sigma_al, sigma_l2, cash_index=1, buffer=0.25)

    assert resultado.weights[1] >= 0.25 - 1e-6


def test_los_pesos_suman_uno_y_son_no_negativos():
    sigma_a, sigma_al, sigma_l2 = _caso_replicante()

    resultado = optimizar(sigma_a, sigma_al, sigma_l2, cash_index=1, buffer=0.10)

    assert abs(sum(resultado.weights) - 1.0) < 1e-6
    assert all(w >= -1e-8 for w in resultado.weights)


def test_buffer_mayor_a_uno_es_infactible():
    sigma_a, sigma_al, sigma_l2 = _caso_replicante()

    with pytest.raises(Infactible):
        optimizar(sigma_a, sigma_al, sigma_l2, cash_index=1, buffer=1.5)


def test_phe_es_cero_para_una_cartera_sin_relacion_con_el_pasivo():
    sigma_l2 = 0.0004
    sigma_a = np.diag([1e-12, 1e-12])
    sigma_al = np.array([0.0, 0.0])

    tev, phe = metricas([1.0, 0.0], sigma_a, sigma_al, sigma_l2)

    # Sin covarianza ni varianza propia, el desajuste es exactamente el del pasivo.
    assert abs(tev - np.sqrt(sigma_l2 * 12)) < 1e-6
    assert abs(phe) < 1e-6


def test_phe_esta_acotado_entre_cero_y_uno():
    sigma_l2 = 0.0004
    sigma_a = np.diag([0.01, 0.01])
    sigma_al = np.array([-0.005, -0.005])

    _, phe = metricas([0.5, 0.5], sigma_a, sigma_al, sigma_l2)

    assert 0.0 <= phe <= 1.0


def test_frontera_devuelve_puntos_ordenados_y_completos():
    sigma_a, sigma_al, sigma_l2 = _caso_replicante()

    puntos = frontera(sigma_a, sigma_al, sigma_l2, cash_index=1, buffer=0.10, n=5)

    assert len(puntos) == 5
    assert all({"lam", "tev", "phe", "vol_cartera"} <= set(p) for p in puntos)
    assert [p["lam"] for p in puntos] == sorted(p["lam"] for p in puntos)


def test_acoplamiento_usa_solo_las_fechas_en_comun():
    rng = np.random.default_rng(0)
    retornos = rng.normal(0, 0.02, size=(60, 3))
    pasivo = list(rng.normal(0, 0.01, size=40))

    sigma_al, sigma_l2 = acoplamiento(retornos, _fechas(60), pasivo, _fechas(40))

    assert sigma_al.shape == (3,)
    assert sigma_l2 > 0


def test_acoplamiento_detecta_un_activo_que_replica_el_pasivo():
    rng = np.random.default_rng(1)
    pasivo = rng.normal(0.004, 0.01, size=60)
    retornos = np.column_stack([pasivo, rng.normal(0, 0.02, size=60)])
    fechas = _fechas(60)

    sigma_al, sigma_l2 = acoplamiento(retornos, fechas, list(pasivo), fechas)

    assert abs(sigma_al[0] - sigma_l2) < 1e-12


def test_acoplamiento_ignora_el_rezago_de_publicacion_del_inpc():
    """El INPC va un mes atrás del mercado: el emparejamiento debe ser por fecha."""
    rng = np.random.default_rng(2)
    pasivo = rng.normal(0.004, 0.01, size=59)
    ruido = rng.normal(0, 0.02, size=60)

    # El activo 0 replica el pasivo en las fechas que comparten (meses 1..59).
    columna_replicante = np.append(pasivo, 0.0)
    retornos = np.column_stack([columna_replicante, ruido])

    sigma_al, sigma_l2 = acoplamiento(retornos, _fechas(60), list(pasivo), _fechas(59))

    # Si alineara por la cola, el desfase de un mes rompería la identidad.
    assert abs(sigma_al[0] - sigma_l2) < 1e-12


def test_acoplamiento_sin_suficiente_traslape_levanta():
    rng = np.random.default_rng(3)
    retornos = rng.normal(0, 0.02, size=(60, 3))
    pasivo = list(rng.normal(0, 0.01, size=8))

    with pytest.raises(ValueError):
        acoplamiento(retornos, _fechas(60), pasivo, _fechas(8))
