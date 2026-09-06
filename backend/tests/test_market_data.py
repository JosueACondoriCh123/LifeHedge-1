import numpy as np

from app.cache import DiskCache
from app.config import TICKERS
from app.market_data import covariance, load_market, returns_matrix


def _payload(n_meses=6):
    return {
        "dates": [f"2025-{m:02d}" for m in range(1, n_meses + 1)],
        "returns": {t: [0.01 * (i + 1)] * n_meses for i, t in enumerate(TICKERS)},
    }


def test_load_market_respeta_el_orden_canonico(tmp_path):
    cache = DiskCache(tmp_path / "c", tmp_path / "s")
    market = load_market(cache, fetch=lambda: _payload())

    assert list(market.returns.keys()) == list(TICKERS)
    assert market.stale is False


def test_returns_matrix_tiene_forma_T_por_n(tmp_path):
    cache = DiskCache(tmp_path / "c", tmp_path / "s")
    market = load_market(cache, fetch=lambda: _payload(n_meses=24))

    matrix = returns_matrix(market)

    assert matrix.shape == (24, len(TICKERS))


def test_covariance_es_cuadrada_y_simetrica(tmp_path):
    cache = DiskCache(tmp_path / "c", tmp_path / "s")
    market = load_market(cache, fetch=lambda: _payload(n_meses=24))

    sigma = covariance(returns_matrix(market))

    assert sigma.shape == (len(TICKERS), len(TICKERS))
    np.testing.assert_allclose(sigma, sigma.T, atol=1e-12)


def test_market_caido_sirve_snapshot_marcado_stale(tmp_path):
    cache = DiskCache(tmp_path / "c", tmp_path / "s")
    cache.get_or_fetch("market", 3600, lambda: _payload())

    def caido():
        raise ConnectionError("yfinance caído")

    market = load_market(cache, fetch=caido, ttl_seconds=0)

    assert market.stale is True
    assert list(market.returns.keys()) == list(TICKERS)
