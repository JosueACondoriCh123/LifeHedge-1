from app.cache import DiskCache
from app.config import RUBROS
from app.inpc import load_inpc, niveles_a_variaciones


def _payload(n=6):
    claves = ("general",) + RUBROS
    return {
        "dates": [f"2025-{m:02d}" for m in range(1, n + 1)],
        "series": {k: [0.004] * n for k in claves},
    }


def test_load_inpc_expone_general_y_los_seis_rubros(tmp_path):
    cache = DiskCache(tmp_path / "c", tmp_path / "s")
    data = load_inpc(cache, fetch=lambda: _payload())

    assert set(data.series) == {"general", *RUBROS}
    assert data.stale is False


def test_niveles_a_variaciones_calcula_cambio_relativo():
    niveles = [100.0, 101.0, 102.01]

    variaciones = niveles_a_variaciones(niveles)

    assert len(variaciones) == 2
    assert abs(variaciones[0] - 0.01) < 1e-9
    assert abs(variaciones[1] - 0.01) < 1e-9


def test_inpc_caido_sirve_snapshot_marcado_stale(tmp_path):
    cache = DiskCache(tmp_path / "c", tmp_path / "s")
    cache.get_or_fetch("inpc", 3600, lambda: _payload())

    def caido():
        raise ConnectionError("INEGI caído")

    data = load_inpc(cache, fetch=caido, ttl_seconds=0)

    assert data.stale is True
    assert set(data.series) == {"general", *RUBROS}
