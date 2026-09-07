from __future__ import annotations

import math
from typing import Any

import numpy as np

from app.config import RUBROS, TICKER_LABELS, TICKERS, settings
from app.inpc import InpcData
from app.market_data import MarketData, covariance, returns_matrix
from app.liability import serie_personal
from app.optimizer import acoplamiento, frontera, metricas, optimizar
from app.monte_carlo import calibrar, resumir, simular


def calcular_matriz_acoplamiento(
    market: MarketData,
    inpc: InpcData,
) -> dict[str, Any]:
    """Calcula econometricamente la matriz de correlacion empirica y covarianza
    entre los 8 activos del universo de inversion y los rubros de gasto del INPC.
    """
    fechas_comunes = sorted(set(market.dates).intersection(set(inpc.dates)))
    if len(fechas_comunes) < 12:
        raise ValueError(
            f"Historia comun insuficiente para acoplamiento: {len(fechas_comunes)} meses"
        )

    idx_m = {d: i for i, d in enumerate(market.dates)}
    idx_i = {d: i for i, d in enumerate(inpc.dates)}

    n = len(fechas_comunes)
    retornos_activos = np.zeros((n, len(TICKERS)))
    for j, ticker in enumerate(TICKERS):
        retornos_activos[:, j] = [market.returns[ticker][idx_m[d]] for d in fechas_comunes]

    todos_rubros = list(RUBROS) + (["general"] if "general" in inpc.series else [])
    retornos_rubros = np.zeros((n, len(todos_rubros)))
    for k, rubro in enumerate(todos_rubros):
        retornos_rubros[:, k] = [inpc.series[rubro][idx_i[d]] for d in fechas_comunes]

    vol_activos_mensual = np.std(retornos_activos, axis=0, ddof=1)
    vol_rubros_mensual = np.std(retornos_rubros, axis=0, ddof=1)

    vol_activos_anual = {
        ticker: float(vol_activos_mensual[j] * math.sqrt(12))
        for j, ticker in enumerate(TICKERS)
    }
    vol_rubros_anual = {
        rubro: float(vol_rubros_mensual[k] * math.sqrt(12))
        for k, rubro in enumerate(todos_rubros)
    }

    correlaciones: dict[str, dict[str, float]] = {}
    covarianzas: dict[str, dict[str, float]] = {}

    for j, ticker in enumerate(TICKERS):
        correlaciones[ticker] = {}
        covarianzas[ticker] = {}
        v_a = retornos_activos[:, j]
        std_a = vol_activos_mensual[j]

        for k, rubro in enumerate(todos_rubros):
            v_r = retornos_rubros[:, k]
            std_r = vol_rubros_mensual[k]

            cov = float(np.cov(v_a, v_r, ddof=1)[0, 1])
            covarianzas[ticker][rubro] = cov

            if std_a > 0 and std_r > 0:
                corr = float(cov / (std_a * std_r))
                corr = max(-1.0, min(1.0, corr))
            else:
                corr = 0.0
            correlaciones[ticker][rubro] = round(corr, 4)

    return {
        "meses_observados": n,
        "periodo": f"{fechas_comunes[0]} -> {fechas_comunes[-1]}",
        "activos": [
            {
                "ticker": t,
                "label": TICKER_LABELS.get(t, t),
                "volatilidad_anual": round(vol_activos_anual[t], 4),
            }
            for t in TICKERS
        ],
        "rubros": [
            {
                "rubro": r,
                "volatilidad_anual": round(vol_rubros_anual[r], 4),
            }
            for r in todos_rubros
        ],
        "matriz_correlacion": correlaciones,
        "matriz_covarianza_mensual": covarianzas,
        "volatilidades_activos": vol_activos_anual,
        "volatilidades_rubros": vol_rubros_anual,
    }


def generar_cartera_base_inegi(
    market: MarketData,
    inpc: InpcData,
    buffer: float = 0.10,
    horizonte_meses: int = 12,
) -> dict[str, Any]:
    """Genera la cartera base de referencia inicial utilizando la canasta de ponderacion
    nacional del INEGI y ejecutando el calculo cuadratico en vivo.
    """
    pesos_nacionales = {
        "alimentos": 0.285,
        "vivienda": 0.215,
        "transporte": 0.165,
        "salud": 0.082,
        "educacion": 0.105,
        "otros": 0.148,
    }
    suma = sum(pesos_nacionales.values())
    pesos_nacionales = {k: round(v / suma, 4) for k, v in pesos_nacionales.items()}

    inflacion = serie_personal(pesos_nacionales, inpc)
    matriz = returns_matrix(market)
    sigma_a = covariance(matriz)
    sigma_al, sigma_l2 = acoplamiento(
        matriz, market.dates, inflacion.personal, inflacion.dates
    )
    resultado = optimizar(
        sigma_a, sigma_al, sigma_l2, settings.cash_index, buffer
    )
    puntos = frontera(
        sigma_a, sigma_al, sigma_l2, settings.cash_index, buffer
    )

    solo_cetes = np.zeros(len(TICKERS))
    solo_cetes[settings.cash_index] = 1.0
    tev_cetes, phe_cetes = metricas(solo_cetes, sigma_a, sigma_al, sigma_l2)

    w = np.asarray(resultado.weights, dtype=float)
    retornos_cartera = matriz @ w
    params_cartera = calibrar(list(retornos_cartera))
    params_pasivo = calibrar(inflacion.personal)
    paths_cartera = simular(params_cartera, horizonte=horizonte_meses, seed=42)
    paths_pasivo = simular(params_pasivo, horizonte=horizonte_meses, seed=43)
    riesgo = resumir(paths_cartera, paths_pasivo)

    stale = market.stale or inpc.stale
    as_of = min(market.as_of, inpc.as_of)

    return {
        "pesos": pesos_nacionales,
        "inflacion": {
            "dates": inflacion.dates,
            "personal": inflacion.personal,
            "general": inflacion.general,
            "personal_anual": inflacion.personal_anual,
            "general_anual": inflacion.general_anual,
            "delta_anualizado": inflacion.delta_anualizado,
            "volatilidad_anual": inflacion.volatilidad_anual,
            "stale": stale,
            "as_of": as_of,
        },
        "optimo": {
            "assets": [
                {"ticker": t, "label": TICKER_LABELS[t]} for t in TICKERS
            ],
            "weights": resultado.weights,
            "tev": resultado.tev,
            "phe": resultado.phe,
            "benchmark_cetes": {
                "weights": [float(v) for v in solo_cetes],
                "tev": tev_cetes,
                "phe": phe_cetes,
            },
            "frontera": puntos,
            "stale": stale,
            "as_of": as_of,
        },
        "riesgo": {
            "percentiles": riesgo.percentiles,
            "var_95": riesgo.var_95,
            "cvar_95": riesgo.cvar_95,
            "media_final": riesgo.media_final,
            "stale": stale,
            "as_of": as_of,
        },
        "buffer": buffer,
        "horizonte": horizonte_meses,
        "fuente": "INEGI Nacional Base 2018 (Calculo Oficial Dinamico)",
    }


def _calcular_escenario_individual(
    esc_id: str,
    etiqueta: str,
    categoria: str,
    descripcion: str,
    pesos_canasta: dict[str, float],
    buffer: float,
    horizonte_meses: int,
    market: MarketData,
    inpc: InpcData,
    matriz: np.ndarray,
    sigma_a: np.ndarray,
) -> dict[str, Any]:
    suma = sum(pesos_canasta.values())
    pesos_norm = {k: round(v / suma, 4) for k, v in pesos_canasta.items()}

    inflacion = serie_personal(pesos_norm, inpc)
    sigma_al, sigma_l2 = acoplamiento(
        matriz, market.dates, inflacion.personal, inflacion.dates
    )
    resultado = optimizar(
        sigma_a, sigma_al, sigma_l2, settings.cash_index, buffer
    )
    w = np.asarray(resultado.weights, dtype=float)
    retornos_cartera = matriz @ w
    params_cartera = calibrar(list(retornos_cartera))
    params_pasivo = calibrar(inflacion.personal)
    paths_cartera = simular(params_cartera, horizonte=horizonte_meses, seed=42)
    paths_pasivo = simular(params_pasivo, horizonte=horizonte_meses, seed=43)
    res_riesgo = resumir(paths_cartera, paths_pasivo)

    assets = [{"ticker": t, "label": TICKER_LABELS.get(t, t)} for t in TICKERS]

    return {
        "id": esc_id,
        "etiqueta": etiqueta,
        "categoria": categoria,
        "descripcion": descripcion,
        "delta_anualizado": round(float(inflacion.delta_anualizado), 4),
        "phe": round(float(resultado.phe), 4),
        "tev": round(float(resultado.tev), 4),
        "pesos": pesos_norm,
        "optimo": {
            "phe": round(float(resultado.phe), 4),
            "tev": round(float(resultado.tev), 4),
            "assets": assets,
            "weights": [round(float(x), 4) for x in resultado.weights],
        },
        "riesgo": {
            "var_95": round(float(res_riesgo.var_95), 4),
            "cvar_95": round(float(res_riesgo.cvar_95), 4),
            "media_final": round(float(res_riesgo.media_final), 4),
        },
    }


def generar_escenarios_comparativos(
    market: MarketData,
    inpc: InpcData,
    buffer: float = 0.10,
    horizonte_meses: int = 12,
) -> list[dict[str, Any]]:
    """Calcula dinámicamente escenarios macroeconómicos comparativos enfrentados
    utilizando las cotizaciones y series de inflación reales del momento.
    """
    matriz = returns_matrix(market)
    sigma_a = covariance(matriz)

    escenarios_def = [
        {
            "id": "esc-base",
            "etiqueta": "Cartera Base LDI (Consumo Balanceado)",
            "categoria": "Modelo Institucional Oficial",
            "descripcion": "Canasta oficial nacional del INEGI (Base 2018) con optimización convexa al vuelo.",
            "pesos": {
                "alimentos": 0.285,
                "vivienda": 0.215,
                "transporte": 0.165,
                "salud": 0.082,
                "educacion": 0.105,
                "otros": 0.148,
            },
            "buffer": buffer,
        },
        {
            "id": "esc-alimentos",
            "etiqueta": "Cartera Anti-Inflación (Shock Agropecuario & Alimentos)",
            "categoria": "Choque Sectorial INEGI",
            "descripcion": "Sobreponderación en alimentos y materias primas agrícolas ante sequías o volatilidad de granos.",
            "pesos": {
                "alimentos": 0.450,
                "vivienda": 0.180,
                "transporte": 0.160,
                "salud": 0.070,
                "educacion": 0.060,
                "otros": 0.080,
            },
            "buffer": buffer,
        },
        {
            "id": "esc-dolar",
            "etiqueta": "Cartera Cobertura Dólar (Presión Cambiaria USD/MXN)",
            "categoria": "Choque Macroeconómico FX",
            "descripcion": "Alta sensibilidad cambiaria en transporte, insumos importados y energía ante depreciación del peso.",
            "pesos": {
                "alimentos": 0.220,
                "vivienda": 0.220,
                "transporte": 0.260,
                "salud": 0.100,
                "educacion": 0.060,
                "otros": 0.140,
            },
            "buffer": buffer,
        },
        {
            "id": "esc-tasas",
            "etiqueta": "Cartera Ciclo de Tasas Banxico (Carry Soberano Cetes)",
            "categoria": "Política Monetaria Banxico",
            "descripcion": "Modela el entorno restrictivo con alto colchón de liquidez (30%) capturando tasas soberanas.",
            "pesos": {
                "alimentos": 0.285,
                "vivienda": 0.215,
                "transporte": 0.165,
                "salud": 0.082,
                "educacion": 0.105,
                "otros": 0.148,
            },
            "buffer": max(0.30, buffer),
        },
    ]

    return [
        _calcular_escenario_individual(
            esc_id=esc["id"],
            etiqueta=esc["etiqueta"],
            categoria=esc["categoria"],
            descripcion=esc["descripcion"],
            pesos_canasta=esc["pesos"],
            buffer=esc["buffer"],
            horizonte_meses=horizonte_meses,
            market=market,
            inpc=inpc,
            matriz=matriz,
            sigma_a=sigma_a,
        )
        for esc in escenarios_def
    ]

