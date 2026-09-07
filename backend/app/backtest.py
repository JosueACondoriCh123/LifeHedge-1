from __future__ import annotations

from dataclasses import dataclass
import numpy as np

from app.config import TICKERS
from app.market_data import MarketData, returns_matrix
from app.liability import PersonalInflation

MESES = 12


@dataclass(frozen=True)
class MetricasEstrategia:
    nombre: str
    etiqueta: str
    retorno_acumulado: float
    cagr: float
    volatilidad_anual: float
    sharpe: float
    sortino: float
    max_drawdown: float
    calmar: float
    trayectoria_base100: list[float]


@dataclass(frozen=True)
class BacktestResult:
    fechas: list[str]
    meses_evaluados: int
    estrategias: list[MetricasEstrategia]
    ganancia_poder_adquisitivo_real: float
    estrategia_optima_recomendada: str


def _calcular_drawdown(serie_acum: np.ndarray) -> float:
    pico = np.maximum.accumulate(serie_acum)
    drawdowns = (serie_acum - pico) / pico
    return float(abs(drawdowns.min())) if len(drawdowns) else 0.0


def _calcular_sortino(retornos: np.ndarray, tasa_libre: float) -> float:
    ret_anual = float(retornos.mean() * MESES)
    exceso = ret_anual - tasa_libre
    retornos_negativos = retornos[retornos < 0]
    if len(retornos_negativos) > 1:
        downside_vol = float(retornos_negativos.std(ddof=1) * np.sqrt(MESES))
        if downside_vol > 1e-6:
            return exceso / downside_vol
    return float(ret_anual / (retornos.std(ddof=1) * np.sqrt(MESES) + 1e-6))


def ejecutar_backtest(
    market: MarketData,
    pasivo: PersonalInflation,
    optimal_weights: list[float],
    meses_ventana: int = 36,
) -> BacktestResult:
    matriz = returns_matrix(market)
    fechas_mercado = market.dates
    fechas_pasivo = pasivo.dates

    indice_activos = {f: i for i, f in enumerate(fechas_mercado)}
    indice_pasivo = {f: i for i, f in enumerate(fechas_pasivo)}
    comunes = sorted(set(indice_activos) & set(indice_pasivo))

    if len(comunes) < 12:
        raise ValueError("Se requieren al menos 12 meses comunes para backtesting.")

    # Tomar la ventana solicitada
    if meses_ventana > 0 and len(comunes) > meses_ventana:
        comunes = comunes[-meses_ventana:]

    n_meses = len(comunes)
    sub_matriz = matriz[[indice_activos[f] for f in comunes]]
    ret_pasivo = np.asarray([pasivo.personal[indice_pasivo[f]] for f in comunes], dtype=float)

    # 1. Cartera Óptima LifeHedge
    w_opt = np.asarray(optimal_weights, dtype=float)
    ret_opt = sub_matriz @ w_opt

    # 2. Cartera 60/40 Tradicional (60% S&P 500, 40% Cetes 28D)
    w_60_40 = np.zeros(len(TICKERS))
    if "IVVPESOISHRS.MX" in TICKERS:
        w_60_40[TICKERS.index("IVVPESOISHRS.MX")] = 0.60
    if "CETES28" in TICKERS:
        w_60_40[TICKERS.index("CETES28")] = 0.40
    ret_60_40 = sub_matriz @ w_60_40

    # 3. Solo Cetes 28D
    w_cetes = np.zeros(len(TICKERS))
    if "CETES28" in TICKERS:
        w_cetes[TICKERS.index("CETES28")] = 1.0
    ret_cetes = sub_matriz @ w_cetes

    # 4. Inflación Personal (Pasivo LDI)
    tasa_rf = float(ret_cetes.mean() * MESES)

    defs = [
        ("lifehedge_optimo", "Cartera Óptima LifeHedge", ret_opt),
        ("portafolio_60_40", "Portafolio Tradicional 60/40", ret_60_40),
        ("solo_cetes", "100% Cetes 28D (Efectivo)", ret_cetes),
        ("inflacion_personal", "Crecimiento Inflación Personal", ret_pasivo),
    ]

    estrategias_out: list[MetricasEstrategia] = []
    for cod, nom, serie_rets in defs:
        acum = [100.0]
        for r in serie_rets:
            acum.append(acum[-1] * (1.0 + float(r)))
        acum_np = np.asarray(acum)

        total_ret = float((acum_np[-1] / 100.0) - 1.0)
        cagr = float(np.power(max(acum_np[-1] / 100.0, 0.001), MESES / n_meses) - 1.0)
        vol = float(serie_rets.std(ddof=1) * np.sqrt(MESES)) if len(serie_rets) > 1 else 0.0
        sharpe = float((cagr - tasa_rf) / vol) if vol > 1e-6 else 0.0
        sortino = _calcular_sortino(serie_rets, tasa_rf)
        max_dd = _calcular_drawdown(acum_np)
        calmar = float(cagr / max_dd) if max_dd > 1e-4 else cagr * 10.0

        estrategias_out.append(
            MetricasEstrategia(
                nombre=cod,
                etiqueta=nom,
                retorno_acumulado=round(total_ret, 4),
                cagr=round(cagr, 4),
                volatilidad_anual=round(vol, 4),
                sharpe=round(sharpe, 2),
                sortino=round(sortino, 2),
                max_drawdown=round(max_dd, 4),
                calmar=round(calmar, 2),
                trayectoria_base100=[round(v, 2) for v in acum],
            )
        )

    # Ganancia en poder adquisitivo real = Retorno acumulado Óptimo - Inflación Personal acumulada
    opt_ret = estrategias_out[0].retorno_acumulado
    inf_ret = estrategias_out[3].retorno_acumulado
    ganancia_real = round(opt_ret - inf_ret, 4)

    return BacktestResult(
        fechas=["Inicio"] + comunes,
        meses_evaluados=n_meses,
        estrategias=estrategias_out,
        ganancia_poder_adquisitivo_real=ganancia_real,
        estrategia_optima_recomendada="Cartera Óptima LifeHedge (Máxima Inmunización LDI)",
    )
