import json

import pytest

from app.cache import DiskCache, NoDataAvailable


def _dirs(tmp_path):
    cache_dir = tmp_path / "cache"
    snapshot_dir = tmp_path / "snapshot"
    cache_dir.mkdir()
    snapshot_dir.mkdir()
    return cache_dir, snapshot_dir


def test_fetch_exitoso_se_guarda_y_no_es_stale(tmp_path):
    cache_dir, snapshot_dir = _dirs(tmp_path)
    cache = DiskCache(cache_dir, snapshot_dir)

    result = cache.get_or_fetch("market", 3600, lambda: {"valor": 1})

    assert result.payload == {"valor": 1}
    assert result.stale is False
    assert (cache_dir / "market.json").exists()


def test_segunda_llamada_dentro_del_ttl_no_vuelve_a_pedir(tmp_path):
    cache_dir, snapshot_dir = _dirs(tmp_path)
    cache = DiskCache(cache_dir, snapshot_dir)
    llamadas = []

    def fetch():
        llamadas.append(1)
        return {"valor": 1}

    cache.get_or_fetch("market", 3600, fetch)
    result = cache.get_or_fetch("market", 3600, fetch)

    assert len(llamadas) == 1
    assert result.stale is False


def test_fetch_caido_cae_a_cache_vencido_y_marca_stale(tmp_path):
    cache_dir, snapshot_dir = _dirs(tmp_path)
    cache = DiskCache(cache_dir, snapshot_dir)
    cache.get_or_fetch("market", 3600, lambda: {"valor": 1})

    def fetch_caido():
        raise ConnectionError("yfinance caído")

    result = cache.get_or_fetch("market", 0, fetch_caido)

    assert result.payload == {"valor": 1}
    assert result.stale is True


def test_sin_cache_y_fetch_caido_cae_al_snapshot(tmp_path):
    cache_dir, snapshot_dir = _dirs(tmp_path)
    (snapshot_dir / "market.json").write_text(
        json.dumps({"payload": {"valor": 99}, "as_of": "2026-01-01T00:00:00"}),
        encoding="utf-8",
    )
    cache = DiskCache(cache_dir, snapshot_dir)

    def fetch_caido():
        raise ConnectionError("yfinance caído")

    result = cache.get_or_fetch("market", 3600, fetch_caido)

    assert result.payload == {"valor": 99}
    assert result.stale is True
    assert result.as_of == "2026-01-01T00:00:00"


def test_sin_cache_sin_snapshot_y_fetch_caido_levanta(tmp_path):
    cache_dir, snapshot_dir = _dirs(tmp_path)
    cache = DiskCache(cache_dir, snapshot_dir)

    with pytest.raises(NoDataAvailable):
        cache.get_or_fetch(
            "market", 3600, lambda: (_ for _ in ()).throw(ConnectionError())
        )
