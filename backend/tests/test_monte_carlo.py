import numpy as np

from app.monte_carlo import JumpParams, calibrar, resumir, simular


def test_sin_saltos_y_sin_volatilidad_el_camino_es_deterministico():
    params = JumpParams(mu=0.12, sigma=0.0, lam=0.0, mu_j=0.0, sigma_j=0.0)

    paths = simular(params, n_paths=10, horizonte=12)

    esperado = np.exp(0.12)  # mu anual * 1 año
    assert paths.shape == (10, 12)
    np.testing.assert_allclose(paths[:, -1], esperado, rtol=1e-9)


def test_la_semilla_hace_la_simulacion_reproducible():
    params = JumpParams(mu=0.05, sigma=0.15, lam=0.5, mu_j=-0.02, sigma_j=0.03)

    a = simular(params, n_paths=100, horizonte=12, seed=7)
    b = simular(params, n_paths=100, horizonte=12, seed=7)

    np.testing.assert_array_equal(a, b)


def test_semillas_distintas_dan_caminos_distintos():
    params = JumpParams(mu=0.05, sigma=0.15, lam=0.5, mu_j=-0.02, sigma_j=0.03)

    a = simular(params, n_paths=100, horizonte=12, seed=7)
    b = simular(params, n_paths=100, horizonte=12, seed=8)

    assert not np.allclose(a, b)


def test_mas_saltos_aumentan_la_dispersion():
    base = JumpParams(mu=0.05, sigma=0.10, lam=0.0, mu_j=0.0, sigma_j=0.0)
    con_saltos = JumpParams(mu=0.05, sigma=0.10, lam=3.0, mu_j=0.0, sigma_j=0.08)

    disp_base = simular(base, n_paths=5000)[:, -1].std()
    disp_saltos = simular(con_saltos, n_paths=5000)[:, -1].std()

    assert disp_saltos > disp_base


def test_cvar_es_al_menos_tan_severo_como_var():
    rng = np.random.default_rng(3)
    cartera = np.cumprod(1 + rng.normal(0.004, 0.02, size=(2000, 12)), axis=1)
    pasivo = np.cumprod(1 + rng.normal(0.005, 0.01, size=(2000, 12)), axis=1)

    resumen = resumir(cartera, pasivo)

    # Convención del módulo: pérdida positiva. La cola es peor que el corte.
    assert resumen.cvar_95 >= resumen.var_95


def test_percentiles_tienen_la_longitud_del_horizonte_y_estan_ordenados():
    rng = np.random.default_rng(4)
    cartera = np.cumprod(1 + rng.normal(0.004, 0.02, size=(2000, 12)), axis=1)
    pasivo = np.cumprod(1 + rng.normal(0.005, 0.01, size=(2000, 12)), axis=1)

    resumen = resumir(cartera, pasivo)

    for clave in ("p5", "p25", "p50", "p75", "p95"):
        assert len(resumen.percentiles[clave]) == 12
    ultimo = [resumen.percentiles[k][-1] for k in ("p5", "p25", "p50", "p75", "p95")]
    assert ultimo == sorted(ultimo)


def test_calibrar_recupera_la_media_y_la_volatilidad():
    rng = np.random.default_rng(5)
    serie = list(rng.normal(0.005, 0.01, size=240))

    params = calibrar(serie)

    assert abs(params.mu - 0.005 * 12) < 0.02
    assert abs(params.sigma - 0.01 * np.sqrt(12)) < 0.02
    assert params.lam >= 0.0
