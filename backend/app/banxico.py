from __future__ import annotations

from datetime import datetime

import requests

from app.config import BANXICO_SERIES, settings

BASE_URL = (
    "https://www.banxico.org.mx/SieAPIRest/service/v1/series/{series}/datos/"
    "{inicio}/{fin}"
)

MESES = 12


class SinToken(RuntimeError):
    """Falta el token del SIE de Banxico."""


def _fetch_serie(serie: str, token: str, inicio: str, fin: str) -> dict[str, float]:
    """Observaciones diarias o mensuales, quedándonos con la última de cada mes."""
    response = requests.get(
        BASE_URL.format(series=serie, inicio=inicio, fin=fin),
        headers={"Bmx-Token": token, "Accept": "application/json"},
        timeout=settings.external_timeout_seconds,
    )
    response.raise_for_status()
    datos = response.json()["bmx"]["series"][0]["datos"]

    por_mes: dict[str, float] = {}
    for obs in datos:
        crudo = obs.get("dato")
        if crudo in (None, "", "N/E"):
            continue
        fecha = datetime.strptime(obs["fecha"], "%d/%m/%Y")
        # Las observaciones vienen en orden cronológico: la última gana.
        por_mes[fecha.strftime("%Y-%m")] = float(crudo.replace(",", ""))
    return por_mes


def _variaciones(niveles: dict[str, float]) -> dict[str, float]:
    meses = sorted(niveles)
    return {
        meses[i]: (niveles[meses[i]] / niveles[meses[i - 1]]) - 1.0
        for i in range(1, len(meses))
        if niveles[meses[i - 1]] != 0
    }


def retornos_mensuales(inicio: str = "2015-01-01", fin: str = "2100-01-01") -> dict[str, dict[str, float]]:
    """Retornos mensuales de los instrumentos que Yahoo no cubre.

    - `UDIBONO`: la variación del valor de la UDI. La UDI se indiza al INPC, así
      que esta pata captura la accreción de principal de un udibono, que es lo
      que cubre inflación. Se omite el rendimiento real, chico y estable, para
      no inventar un dato que Banxico no publica en esta serie.
    - `CETES28`: la tasa anual de subasta convertida a rendimiento mensual.
    """
    token = settings.banxico_token
    if not token:
        raise SinToken("BANXICO_TOKEN no configurado")

    udi = _fetch_serie(BANXICO_SERIES["udi"], token, inicio, fin)
    cetes_tasa = _fetch_serie(BANXICO_SERIES["cetes28"], token, inicio, fin)

    return {
        "UDIBONO": _variaciones(udi),
        # La serie viene como tasa anual en por ciento.
        "CETES28": {mes: tasa / 100.0 / MESES for mes, tasa in cetes_tasa.items()},
    }
