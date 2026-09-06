from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import requests

from app.cache import Cached, DiskCache
from app.config import INEGI_AREA, INEGI_INDICATORS, RUBROS, settings

CACHE_KEY = "inpc"
BASE_URL = (
    "https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/"
    "INDICATOR/{indicador}/es/{area}/false/BIE/2.0/{token}?type=json"
)


@dataclass(frozen=True)
class InpcData:
    dates: list[str]
    series: dict[str, list[float]]
    stale: bool
    as_of: str


def niveles_a_variaciones(niveles: list[float]) -> list[float]:
    return [
        (niveles[i] / niveles[i - 1]) - 1.0
        for i in range(1, len(niveles))
        if niveles[i - 1] != 0
    ]


def _fetch_serie(indicador: str, token: str) -> dict[str, float]:
    url = BASE_URL.format(indicador=indicador, area=INEGI_AREA, token=token)
    response = requests.get(url, timeout=settings.external_timeout_seconds)
    response.raise_for_status()
    observaciones = response.json()["Series"][0]["OBSERVATIONS"]
    return {
        obs["TIME_PERIOD"].replace("/", "-"): float(obs["OBS_VALUE"])
        for obs in observaciones
        if obs.get("OBS_VALUE") not in (None, "")
    }


def fetch_inpc_payload() -> dict:
    token = settings.inegi_token
    if not token:
        raise RuntimeError("INEGI_TOKEN no configurado")

    crudo = {clave: _fetch_serie(ind, token) for clave, ind in INEGI_INDICATORS.items()}

    periodos = sorted(set.intersection(*(set(s) for s in crudo.values())))
    if len(periodos) < 25:
        raise ValueError(f"historia de INPC insuficiente: {len(periodos)} periodos")

    series = {
        clave: niveles_a_variaciones([crudo[clave][p] for p in periodos])
        for clave in crudo
    }
    return {"dates": periodos[1:], "series": series}


def load_inpc(
    cache: DiskCache,
    fetch: Callable[[], dict] | None = None,
    ttl_seconds: int | None = None,
) -> InpcData:
    result: Cached = cache.get_or_fetch(
        CACHE_KEY,
        settings.inpc_ttl_seconds if ttl_seconds is None else ttl_seconds,
        fetch or fetch_inpc_payload,
    )
    payload = result.payload
    claves = ("general", *RUBROS)
    return InpcData(
        dates=payload["dates"],
        series={k: payload["series"][k] for k in claves},
        stale=result.stale,
        as_of=result.as_of,
    )
