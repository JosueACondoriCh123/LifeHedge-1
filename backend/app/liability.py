from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.config import RUBROS
from app.inpc import InpcData

MESES = 12


@dataclass(frozen=True)
class PersonalInflation:
    dates: list[str]
    personal: list[float]
    general: list[float]
    delta_anualizado: float
    personal_anual: float
    general_anual: float
    volatilidad_anual: float


def validar_pesos(pesos: dict[str, float]) -> dict[str, float]:
    faltantes = [r for r in RUBROS if r not in pesos]
    if faltantes:
        raise ValueError(f"Faltan rubros de gasto: {', '.join(faltantes)}")

    negativos = [r for r in RUBROS if pesos[r] < 0]
    if negativos:
        raise ValueError(f"Los pesos no pueden ser negativos: {', '.join(negativos)}")

    total = sum(pesos[r] for r in RUBROS)
    if total <= 0:
        raise ValueError("Los pesos de gasto deben sumar más de cero.")

    return {r: pesos[r] / total for r in RUBROS}


def serie_personal(pesos: dict[str, float], inpc: InpcData) -> PersonalInflation:
    normalizados = validar_pesos(pesos)

    matriz = np.column_stack([np.asarray(inpc.series[r], dtype=float) for r in RUBROS])
    vector_pesos = np.asarray([normalizados[r] for r in RUBROS], dtype=float)
    personal = matriz @ vector_pesos
    general = np.asarray(inpc.series["general"], dtype=float)

    personal_anual = float(personal.mean() * MESES)
    general_anual = float(general.mean() * MESES)

    return PersonalInflation(
        dates=list(inpc.dates),
        personal=[float(v) for v in personal],
        general=[float(v) for v in general],
        delta_anualizado=personal_anual - general_anual,
        personal_anual=personal_anual,
        general_anual=general_anual,
        volatilidad_anual=float(personal.std(ddof=1) * np.sqrt(MESES))
        if len(personal) > 1
        else 0.0,
    )
