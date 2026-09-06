from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable

import numpy as np

from app.cache import Cached, DiskCache
from app.config import (
    BANXICO_TICKERS,
    FX_TICKER,
    TICKERS,
    USD_TICKERS,
    settings,
)

CACHE_KEY = "market"
LOOKBACK_MONTHS = 120
MINIMO_MESES = 24


@dataclass(frozen=True)
class MarketData:
    dates: list[str]
    returns: dict[str, list[float]]
    stale: bool
    as_of: str


def _mes_actual() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m")


def _variaciones(niveles: dict[str, float]) -> dict[str, float]:
    meses = sorted(niveles)
    return {
        meses[i]: (niveles[meses[i]] / niveles[meses[i - 1]]) - 1.0
        for i in range(1, len(meses))
        if niveles[meses[i - 1]] != 0
    }


def fetch_market_payload() -> dict:
    """Compone el universo canónico en MXN: Yahoo para los ETFs, Banxico para
    udibonos y cetes, que Yahoo no cubre con historia."""
    from app.banxico import retornos_mensuales
    from app.yahoo import niveles_mensuales

    yahoo_tickers = [t for t in TICKERS if t not in BANXICO_TICKERS]
    niveles = {t: niveles_mensuales(t) for t in yahoo_tickers}

    fx = niveles[FX_TICKER]
    en_mxn = {
        t: (
            {m: v * fx[m] for m, v in serie.items() if m in fx}
            if t in USD_TICKERS
            else dict(serie)
        )
        for t, serie in niveles.items()
    }

    retornos: dict[str, dict[str, float]] = {
        t: _variaciones(serie) for t, serie in en_mxn.items()
    }
    retornos.update(retornos_mensuales())

    faltantes = [t for t in TICKERS if t not in retornos]
    if faltantes:
        raise ValueError(f"sin retornos para: {faltantes}")

    comunes = sorted(set.intersection(*(set(retornos[t]) for t in TICKERS)))
    # El mes en curso está incompleto: su retorno parcial ensuciaría la covarianza.
    comunes = [m for m in comunes if m != _mes_actual()][-LOOKBACK_MONTHS:]

    if len(comunes) < MINIMO_MESES:
        raise ValueError(
            f"historia común insuficiente: {len(comunes)} meses "
            f"(se necesitan {MINIMO_MESES})"
        )

    return {
        "dates": comunes,
        "returns": {t: [retornos[t][m] for m in comunes] for t in TICKERS},
    }


def load_market(
    cache: DiskCache,
    fetch: Callable[[], dict] | None = None,
    ttl_seconds: int | None = None,
) -> MarketData:
    result: Cached = cache.get_or_fetch(
        CACHE_KEY,
        settings.market_ttl_seconds if ttl_seconds is None else ttl_seconds,
        fetch or fetch_market_payload,
    )
    payload = result.payload
    return MarketData(
        dates=payload["dates"],
        returns={t: payload["returns"][t] for t in TICKERS},
        stale=result.stale,
        as_of=result.as_of,
    )


def returns_matrix(market: MarketData) -> np.ndarray:
    return np.column_stack(
        [np.asarray(market.returns[t], dtype=float) for t in TICKERS]
    )


def covariance(matrix: np.ndarray) -> np.ndarray:
    return np.cov(matrix, rowvar=False, ddof=1)
