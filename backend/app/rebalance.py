from __future__ import annotations

from dataclasses import dataclass
import numpy as np

from app.config import TICKERS, TICKER_LABELS

PRECIOS_REFERENCIA_MXN: dict[str, float] = {
    "UDIBONO": 824.35,
    "CETES28": 10.00,
    "NAFTRACISHRS.MX": 54.20,
    "IVVPESOISHRS.MX": 105.40,
    "GLD": 4250.00,
    "XLE": 1680.00,
    "DBA": 485.00,
    "MXN=X": 17.95,
}


@dataclass(frozen=True)
class OrdenEjecucion:
    ticker: str
    label: str
    accion: str  # 'COMPRA' | 'VENTA' | 'MANTENER'
    monto_actual_mxn: float
    monto_objetivo_mxn: float
    delta_mxn: float
    peso_actual_pct: float
    peso_objetivo_pct: float
    titulos_estimados: int
    precio_referencia_mxn: float
    comision_estimada_mxn: float


@dataclass(frozen=True)
class RebalanceResult:
    capital_total: float
    drift_score: float
    requiere_rebalanceo: bool
    costo_comisiones_total: float
    monto_compras_total: float
    monto_ventas_total: float
    ordenes: list[OrdenEjecucion]


def calcular_rebalanceo(
    capital_total: float,
    portafolio_actual: dict[str, float],
    target_weights: list[float],
    comision_broker_pct: float = 0.0025,
    umbral_drift: float = 0.05,
) -> RebalanceResult:
    if capital_total <= 0:
        raise ValueError("El capital total debe ser mayor a cero.")

    if len(target_weights) != len(TICKERS):
        raise ValueError(f"Se esperaban {len(TICKERS)} pesos objetivo.")

    total_actual = sum(portafolio_actual.get(t, 0.0) for t in TICKERS)
    base_capital = capital_total if total_actual == 0 else max(capital_total, total_actual)

    ordenes: list[OrdenEjecucion] = []
    costo_comisiones = 0.0
    monto_compras = 0.0
    monto_ventas = 0.0
    diferencias_pesos: list[float] = []

    for i, ticker in enumerate(TICKERS):
        actual_mxn = float(portafolio_actual.get(ticker, 0.0))
        peso_obj = float(target_weights[i])
        obj_mxn = base_capital * peso_obj

        peso_act = actual_mxn / base_capital if base_capital > 0 else 0.0
        delta = obj_mxn - actual_mxn
        diferencias_pesos.append(abs(peso_obj - peso_act))

        precio = PRECIOS_REFERENCIA_MXN.get(ticker, 100.0)

        if delta > 100.0 and abs(peso_obj - peso_act) > 0.005:
            accion = "COMPRA"
            titulos = int(np.floor(delta / precio))
            comision = delta * comision_broker_pct
            monto_compras += delta
        elif delta < -100.0 and abs(peso_obj - peso_act) > 0.005:
            accion = "VENTA"
            titulos = int(np.floor(abs(delta) / precio))
            comision = abs(delta) * comision_broker_pct
            monto_ventas += abs(delta)
        else:
            accion = "MANTENER"
            titulos = 0
            comision = 0.0

        costo_comisiones += comision

        ordenes.append(
            OrdenEjecucion(
                ticker=ticker,
                label=TICKER_LABELS.get(ticker, ticker),
                accion=accion,
                monto_actual_mxn=round(actual_mxn, 2),
                monto_objetivo_mxn=round(obj_mxn, 2),
                delta_mxn=round(delta, 2),
                peso_actual_pct=round(peso_act, 4),
                peso_objetivo_pct=round(peso_obj, 4),
                titulos_estimados=titulos,
                precio_referencia_mxn=round(precio, 2),
                comision_estimada_mxn=round(comision, 2),
            )
        )

    drift_score = float(sum(diferencias_pesos) / 2.0)
    requiere_rebalanceo = drift_score >= umbral_drift or (monto_compras + monto_ventas) > 500.0

    return RebalanceResult(
        capital_total=round(base_capital, 2),
        drift_score=round(drift_score, 4),
        requiere_rebalanceo=requiere_rebalanceo,
        costo_comisiones_total=round(costo_comisiones, 2),
        monto_compras_total=round(monto_compras, 2),
        monto_ventas_total=round(monto_ventas, 2),
        ordenes=ordenes,
    )
