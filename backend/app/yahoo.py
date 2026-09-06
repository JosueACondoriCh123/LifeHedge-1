from __future__ import annotations

from datetime import datetime, timezone

import requests

from app.config import settings

CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"

# Yahoo rechaza clientes sin User-Agent de navegador.
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; LifeHedge/1.0)"}


class SinDatos(RuntimeError):
    """Yahoo no devolvió historia utilizable para este ticker."""


def _mes(epoch: int) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).strftime("%Y-%m")


def niveles_mensuales(ticker: str, rango: str = "10y") -> dict[str, float]:
    """Cierres mensuales ajustados, indexados por 'YYYY-MM'.

    Se llama directamente al endpoint de gráficas de Yahoo en vez de usar
    yfinance: la librería dejó de negociar bien con la API actual y devuelve
    JSONDecodeError para todos los tickers, mientras que este endpoint responde.
    """
    response = requests.get(
        CHART_URL.format(ticker=ticker),
        params={"range": rango, "interval": "1mo"},
        headers=HEADERS,
        timeout=settings.external_timeout_seconds,
    )
    response.raise_for_status()
    cuerpo = response.json()

    resultados = (cuerpo.get("chart") or {}).get("result") or []
    if not resultados:
        raise SinDatos(f"Yahoo no devolvió resultados para '{ticker}'")

    bloque = resultados[0]
    marcas = bloque.get("timestamp")
    if not marcas:
        raise SinDatos(f"Yahoo no tiene historia para '{ticker}'")

    indicadores = bloque["indicators"]
    if "adjclose" in indicadores:
        cierres = indicadores["adjclose"][0]["adjclose"]
    else:
        cierres = indicadores["quote"][0]["close"]

    niveles = {
        _mes(marca): float(cierre)
        for marca, cierre in zip(marcas, cierres)
        if cierre is not None
    }
    if not niveles:
        raise SinDatos(f"Yahoo devolvió sólo huecos para '{ticker}'")
    return niveles
