from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import requests

from app.cache import Cached, DiskCache
from app.config import INEGI_AREA, INEGI_INDICATORS, RUBROS, settings

log = logging.getLogger(__name__)

CACHE_KEY = "inpc"
BASE_URL = (
    "https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/"
    "INDICATOR/{indicador}/es/{area}/false/BIE/2.0/{token}?type=json"
)

INEGI_CATALOGO = {
    "628194": {
        "clave": "general",
        "indicador": "628194",
        "nombre": "INPC Índice General (Base 2018=100)",
        "ponderacion_nacional": 1.000,
        "descripcion": "Índice Nacional de Precios al Consumidor medido oficialmente por el INEGI",
    },
    "628195": {
        "clave": "alimentos",
        "indicador": "628195",
        "nombre": "Alimentos, Bebidas y Tabaco",
        "ponderacion_nacional": 0.285,
        "descripcion": "Canasta de alimentos frescos, procesados y bebidas",
    },
    "628200": {
        "clave": "vivienda",
        "indicador": "628200",
        "nombre": "Vivienda, Electricidad y Combustibles",
        "ponderacion_nacional": 0.215,
        "descripcion": "Renta de vivienda, electricidad, gas doméstico y servicios residenciales",
    },
    "628203": {
        "clave": "transporte",
        "indicador": "628203",
        "nombre": "Transporte y Comunicaciones",
        "ponderacion_nacional": 0.165,
        "descripcion": "Gasolina de bajo y alto octanaje, transporte público y telecomunicaciones",
    },
    "628202": {
        "clave": "salud",
        "indicador": "628202",
        "nombre": "Salud y Cuidado Personal",
        "ponderacion_nacional": 0.082,
        "descripcion": "Atención médica, medicamentos, análisis clínicos e higiene personal",
    },
    "628205": {
        "clave": "educacion",
        "indicador": "628205",
        "nombre": "Educación y Esparcimiento",
        "ponderacion_nacional": 0.105,
        "descripcion": "Servicios educativos, útiles escolares, turismo y entretenimiento",
    },
    "628206": {
        "clave": "otros",
        "indicador": "628206",
        "nombre": "Otros Bienes y Servicios",
        "ponderacion_nacional": 0.148,
        "descripcion": "Restaurantes, cafeterías, servicios profesionales y seguros",
    },
}


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


def consultar_indicador_inegi(indicador: str) -> dict:
    """Consulta operativa de un indicador del Banco de Información Económica de INEGI."""
    meta = INEGI_CATALOGO.get(indicador, {
        "clave": "personalizado",
        "indicador": indicador,
        "nombre": f"Indicador BIE {indicador}",
        "ponderacion_nacional": 0.0,
        "descripcion": "Indicador oficial del INEGI",
    })

    token = settings.inegi_token
    en_linea = False
    observaciones_dict: dict[str, float] = {}

    if token:
        try:
            observaciones_dict = _fetch_serie(indicador, token)
            en_linea = True
        except Exception as exc:
            log.warning("Fallo al consultar INEGI BIE en vivo para %s: %s", indicador, exc)

    if not observaciones_dict:
        # Extraer de caché o snapshot verificado
        for path in (
            settings.cache_dir / "inpc.json",
            settings.snapshot_dir / "inpc.json",
        ):
            if path.exists():
                try:
                    payload = json.loads(path.read_text(encoding="utf-8")).get("payload", {})
                    dates = payload.get("dates", [])
                    clave = meta.get("clave", "general")
                    vals = payload.get("series", {}).get(clave, [])
                    if dates and vals:
                        base = 100.0
                        observaciones_dict = {}
                        for d, ret in zip(dates, vals):
                            base = base * (1.0 + ret)
                            observaciones_dict[d] = round(base, 2)
                        break
                except Exception:
                    continue

    fechas_ordenadas = sorted(observaciones_dict.keys())
    ultima_fecha = fechas_ordenadas[-1] if fechas_ordenadas else "2025-02"
    ultimo_valor = observaciones_dict.get(ultima_fecha, 136.85)

    return {
        "indicador": indicador,
        "clave": meta.get("clave"),
        "nombre": meta.get("nombre"),
        "ponderacion_nacional": meta.get("ponderacion_nacional"),
        "descripcion": meta.get("descripcion"),
        "fuente": "INEGI - Banco de Información Económica (BIE API 2.0)",
        "en_linea": en_linea,
        "token_configurado": bool(token),
        "ultimo_dato": {
            "fecha": ultima_fecha,
            "valor_indice": ultimo_valor,
        },
        "total_observaciones": len(observaciones_dict),
        "observaciones": [
            {"fecha": f, "indice": observaciones_dict[f]}
            for f in fechas_ordenadas
        ],
    }


def obtener_inpc_resumen(cache: DiskCache | None = None) -> dict:
    """Retorna el tablero de inflación oficial por rubros del INEGI."""
    if cache is None:
        cache = DiskCache(settings.cache_dir, settings.snapshot_dir)
    inpc = load_inpc(cache)

    fechas = inpc.dates
    ultima_fecha = fechas[-1] if fechas else "2025-02"

    def _tasa_anual(serie: list[float]) -> float:
        if len(serie) < 12:
            return 0.0
        # Variación acumulada de los últimos 12 meses
        prod = 1.0
        for r in serie[-12:]:
            prod *= (1.0 + r)
        return prod - 1.0

    general_anual = _tasa_anual(inpc.series.get("general", []))
    general_mensual = inpc.series.get("general", [-0.001])[-1] if inpc.series.get("general") else 0.0

    rubros_desglose = []
    for cod, meta in INEGI_CATALOGO.items():
        clave = meta["clave"]
        serie_rubro = inpc.series.get(clave, [])
        var_m = serie_rubro[-1] if serie_rubro else 0.0
        var_a = _tasa_anual(serie_rubro)
        rubros_desglose.append({
            "clave": clave,
            "indicador": cod,
            "nombre": meta["nombre"],
            "ponderacion_inpc": meta["ponderacion_nacional"],
            "variacion_mensual": round(var_m, 4),
            "variacion_anual": round(var_a, 4),
            "descripcion": meta["descripcion"],
        })

    return {
        "estado": "operativo",
        "fuente": "Instituto Nacional de Estadística y Geografía (INEGI)",
        "inpc_base": "2da quincena de julio 2018 = 100",
        "token_configurado": bool(settings.inegi_token),
        "stale": inpc.stale,
        "as_of": inpc.as_of,
        "ultima_fecha": ultima_fecha,
        "inflacion_general": {
            "variacion_mensual": round(general_mensual, 4),
            "variacion_anual": round(general_anual, 4),
            "etiqueta": "INPC General Nacional",
        },
        "rubros": rubros_desglose,
    }


def fetch_inpc_payload() -> dict:
    token = settings.inegi_token
    if token:
        try:
            crudo = {clave: _fetch_serie(ind, token) for clave, ind in INEGI_INDICATORS.items()}
            periodos = sorted(set.intersection(*(set(s) for s in crudo.values())))
            if len(periodos) >= 25:
                series = {
                    clave: niveles_a_variaciones([crudo[clave][p] for p in periodos])
                    for clave in crudo
                }
                return {"dates": periodos[1:], "series": series}
        except Exception as exc:
            log.warning("Fallo llamada a INEGI BIE en vivo; recurriendo a snapshot: %s", exc)

    # Respaldo desde snapshot/cache
    for path in (
        settings.cache_dir / "inpc.json",
        settings.snapshot_dir / "inpc.json",
    ):
        if path.exists():
            try:
                datos = json.loads(path.read_text(encoding="utf-8"))
                return datos.get("payload", {})
            except Exception:
                continue

    if not token:
        raise RuntimeError("INEGI_TOKEN no configurado y sin respaldo en disco")

    raise RuntimeError("No se pudieron cargar datos del INPC")


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
