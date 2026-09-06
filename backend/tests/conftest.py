"""Fixture de datos para los tests de la API.

Las rutas leen mercado e INPC a través de `app.main.cache`. Aquí se apunta ese
caché a un directorio temporal sembrado con series sintéticas y reproducibles,
de modo que la suite corra sin red, sin tokens y sin depender de los snapshots
reales que se commitean para producción.

Las series se construyen con una relación económica deliberada: la pata de
udibonos sigue al INPC, así que el optimizador tiene algo real que encontrar y
los tests de integración comprueban comportamiento, no ruido.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import numpy as np
import pytest

import app.main as main
from app.auth import Usuario, limitar_analisis, usuario_actual
from app.cache import DiskCache
from app.config import RUBROS, TICKERS

MESES_FIXTURE = 72


@pytest.fixture(autouse=True)
def usuario_de_prueba():
    app = main.app
    app.dependency_overrides[usuario_actual] = lambda: Usuario(
        id="00000000-0000-0000-0000-000000000001",
        email="test@lifehedge.mx",
    )
    limitar_analisis.reiniciar()
    yield
    app.dependency_overrides.pop(usuario_actual, None)
    limitar_analisis.reiniciar()


def _fechas(n: int) -> list[str]:
    return [f"{2018 + i // 12:04d}-{(i % 12) + 1:02d}" for i in range(n)]


def _series_sinteticas() -> tuple[dict, dict]:
    rng = np.random.default_rng(2026)
    fechas = _fechas(MESES_FIXTURE)

    # INPC general: 0.4% mensual con ruido moderado.
    general = rng.normal(0.004, 0.0015, MESES_FIXTURE)
    rubros = {
        rubro: general + rng.normal(0.0, 0.0010, MESES_FIXTURE) for rubro in RUBROS
    }

    retornos = {
        # Los udibonos acompañan al INPC: es la pata que cubre inflación.
        "UDIBONO": general + rng.normal(0.0, 0.0003, MESES_FIXTURE),
        # Cetes: rendimiento casi constante, sin relación con la inflación.
        "CETES28": np.full(MESES_FIXTURE, 0.0075) + rng.normal(0.0, 0.0002, MESES_FIXTURE),
        "NAFTRACISHRS.MX": rng.normal(0.008, 0.045, MESES_FIXTURE),
        "IVVPESOISHRS.MX": rng.normal(0.010, 0.040, MESES_FIXTURE),
        "GLD": rng.normal(0.006, 0.035, MESES_FIXTURE),
        # Energía y agro sí se mueven con los precios al consumidor.
        "XLE": 3.0 * general + rng.normal(0.0, 0.050, MESES_FIXTURE),
        "DBA": 2.0 * general + rng.normal(0.0, 0.030, MESES_FIXTURE),
        "MXN=X": rng.normal(0.002, 0.025, MESES_FIXTURE),
    }

    market = {
        "dates": fechas,
        "returns": {t: [float(v) for v in retornos[t]] for t in TICKERS},
    }
    inpc = {
        # El INPC se publica con rezago: un mes menos que el mercado, a propósito.
        "dates": fechas[:-1],
        "series": {
            "general": [float(v) for v in general[:-1]],
            **{r: [float(v) for v in rubros[r][:-1]] for r in RUBROS},
        },
    }
    return market, inpc


@pytest.fixture
def cache_sintetico(tmp_path, monkeypatch):
    """Siembra caché y snapshot, y devuelve ambos directorios.

    No es autouse: sólo lo activa test_api.py. Otros módulos usan `tmp_path`
    para sus propios directorios y sembrarlo aquí colisionaría con ellos.

    El caché se escribe con marca de tiempo actual para que el TTL corte antes
    de intentar cualquier fetch: la suite no toca la red. El snapshot queda
    sembrado con los mismos datos para poder ejercitar el camino degradado.
    """
    cache_dir = tmp_path / "cache"
    snapshot_dir = tmp_path / "snapshot"
    cache_dir.mkdir(parents=True)
    snapshot_dir.mkdir(parents=True)

    market, inpc = _series_sinteticas()
    ahora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for clave, payload in (("market", market), ("inpc", inpc)):
        cuerpo = json.dumps({"payload": payload, "as_of": ahora})
        (cache_dir / f"{clave}.json").write_text(cuerpo, encoding="utf-8")
        (snapshot_dir / f"{clave}.json").write_text(
            json.dumps({"payload": payload, "as_of": "2026-01-01T00:00:00+00:00"}),
            encoding="utf-8",
        )

    monkeypatch.setattr(main, "cache", DiskCache(cache_dir, snapshot_dir))
    return {"cache_dir": cache_dir, "snapshot_dir": snapshot_dir}
