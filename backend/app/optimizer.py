from __future__ import annotations

from dataclasses import dataclass

import cvxpy as cp
import numpy as np

MESES = 12


class Infactible(ValueError):
    """El problema de optimización no admite solución con estas restricciones."""


@dataclass(frozen=True)
class HedgeResult:
    weights: list[float]
    tev: float
    phe: float
    surplus_var_mensual: float


def _surplus_var(
    weights: np.ndarray,
    sigma_a: np.ndarray,
    sigma_al: np.ndarray,
    sigma_l2: float,
) -> float:
    """Var(r_cartera - r_pasivo) mensual, acotada a no-negativa."""
    valor = float(weights @ sigma_a @ weights - 2.0 * weights @ sigma_al + sigma_l2)
    return max(valor, 0.0)


def metricas(
    weights,
    sigma_a: np.ndarray,
    sigma_al: np.ndarray,
    sigma_l2: float,
) -> tuple[float, float]:
    w = np.asarray(weights, dtype=float)
    var_mensual = _surplus_var(w, np.asarray(sigma_a), np.asarray(sigma_al), sigma_l2)

    tev = float(np.sqrt(var_mensual * MESES))
    if sigma_l2 <= 0:
        return tev, 0.0

    phe = 1.0 - (var_mensual / sigma_l2)
    return tev, float(np.clip(phe, 0.0, 1.0))


def optimizar(
    sigma_a,
    sigma_al,
    sigma_l2: float,
    cash_index: int,
    buffer: float = 0.10,
    lam: float = 1.0,
) -> HedgeResult:
    sigma_a = np.asarray(sigma_a, dtype=float)
    # Proyección simétrica y regularización espectral para estabilidad numérica
    sigma_a = (sigma_a + sigma_a.T) / 2.0
    w_eig, v_eig = np.linalg.eigh(sigma_a)
    if np.any(w_eig < 1e-8):
        sigma_a = v_eig @ np.diag(np.maximum(w_eig, 1e-8)) @ v_eig.T

    sigma_al = np.asarray(sigma_al, dtype=float)
    n = sigma_a.shape[0]

    if not 0.0 <= buffer <= 1.0:
        raise Infactible(
            f"El buffer de efectivo debe estar entre 0 y 1; recibimos {buffer}."
        )

    w = cp.Variable(n)
    objetivo = cp.Minimize(
        cp.quad_form(w, cp.psd_wrap(sigma_a)) - 2.0 * lam * (sigma_al @ w)
    )
    restricciones = [cp.sum(w) == 1, w >= 0, w[cash_index] >= buffer]

    problema = cp.Problem(objetivo, restricciones)
    try:
        problema.solve(solver=cp.CLARABEL)
    except cp.error.SolverError as exc:
        raise Infactible("El solver no pudo resolver el problema.") from exc

    if w.value is None or problema.status not in ("optimal", "optimal_inaccurate"):
        raise Infactible(
            f"No existe una cartera que cumpla las restricciones "
            f"(estado: {problema.status})."
        )

    pesos = np.clip(np.asarray(w.value, dtype=float), 0.0, None)
    pesos = pesos / pesos.sum()

    tev, phe = metricas(pesos, sigma_a, sigma_al, sigma_l2)
    return HedgeResult(
        weights=[float(v) for v in pesos],
        tev=tev,
        phe=phe,
        surplus_var_mensual=_surplus_var(pesos, sigma_a, sigma_al, sigma_l2),
    )


def frontera(
    sigma_a,
    sigma_al,
    sigma_l2: float,
    cash_index: int,
    buffer: float = 0.10,
    n: int = 12,
) -> list[dict]:
    sigma_a = np.asarray(sigma_a, dtype=float)
    puntos: list[dict] = []
    for lam in np.linspace(0.0, 2.0, n):
        try:
            resultado = optimizar(
                sigma_a, sigma_al, sigma_l2, cash_index, buffer, lam=float(lam)
            )
        except Infactible:
            continue
        w = np.asarray(resultado.weights, dtype=float)
        puntos.append(
            {
                "lam": float(lam),
                "tev": resultado.tev,
                "phe": resultado.phe,
                "vol_cartera": float(np.sqrt(max(w @ sigma_a @ w, 0.0) * MESES)),
            }
        )
    return puntos


def acoplamiento(
    returns_matrix,
    fechas_activos: list[str],
    liability_serie,
    fechas_pasivo: list[str],
) -> tuple[np.ndarray, float]:
    """Covarianza activos-pasivo y varianza del pasivo, alineadas por fecha común.

    INEGI publica el INPC con rezago frente al mercado. Emparejar por posición
    desde el final desfasaría las series uno o dos meses y sesgaría la
    covarianza sin que nada falle a la vista.
    """
    activos = np.asarray(returns_matrix, dtype=float)
    pasivo = np.asarray(liability_serie, dtype=float)

    indice_activos = {fecha: i for i, fecha in enumerate(fechas_activos)}
    indice_pasivo = {fecha: i for i, fecha in enumerate(fechas_pasivo)}
    comunes = sorted(set(indice_activos) & set(indice_pasivo))

    t = len(comunes)
    if t < 12:
        raise ValueError(
            f"Se necesitan al menos 12 meses en común entre mercado e INPC; "
            f"sólo hay {t}."
        )

    activos = activos[[indice_activos[f] for f in comunes]]
    pasivo = pasivo[[indice_pasivo[f] for f in comunes]]

    activos_centrados = activos - activos.mean(axis=0)
    pasivo_centrado = pasivo - pasivo.mean()

    sigma_al = (activos_centrados.T @ pasivo_centrado) / (t - 1)
    sigma_l2 = float(pasivo_centrado @ pasivo_centrado) / (t - 1)
    return sigma_al, sigma_l2
