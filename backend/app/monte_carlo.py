from __future__ import annotations

from dataclasses import dataclass

import numpy as np

MESES = 12
UMBRAL_SALTO = 3.0


@dataclass(frozen=True)
class JumpParams:
    mu: float
    sigma: float
    lam: float
    mu_j: float
    sigma_j: float


@dataclass(frozen=True)
class RiskSummary:
    percentiles: dict[str, list[float]]
    var_95: float
    cvar_95: float
    media_final: float


def calibrar(serie: list[float]) -> JumpParams:
    datos = np.asarray(serie, dtype=float)
    if len(datos) < MESES:
        raise ValueError(f"Se necesitan al menos 12 observaciones; hay {len(datos)}.")

    media = float(datos.mean())
    desv = float(datos.std(ddof=1))

    if desv == 0:
        return JumpParams(mu=media * MESES, sigma=0.0, lam=0.0, mu_j=0.0, sigma_j=0.0)

    es_salto = np.abs(datos - media) > UMBRAL_SALTO * desv
    saltos = datos[es_salto]
    normales = datos[~es_salto]

    # La difusión se estima sobre los meses sin salto; los saltos van al proceso
    # de Poisson.
    base = normales if len(normales) > 1 else datos
    return JumpParams(
        mu=float(base.mean()) * MESES,
        sigma=float(base.std(ddof=1)) * np.sqrt(MESES),
        lam=float(len(saltos)) / len(datos) * MESES,
        mu_j=float(saltos.mean() - media) if len(saltos) else 0.0,
        sigma_j=float(saltos.std(ddof=1)) if len(saltos) > 1 else 0.0,
    )


def simular(
    params: JumpParams,
    n_paths: int = 1000,
    horizonte: int = MESES,
    seed: int = 42,
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    dt = 1.0 / MESES
    forma = (n_paths, horizonte)

    difusion = (params.mu - 0.5 * params.sigma**2) * dt + params.sigma * np.sqrt(
        dt
    ) * rng.standard_normal(forma)

    magnitud = np.zeros(forma)
    if params.lam > 0:
        conteo_saltos = rng.poisson(params.lam * dt, forma)
        magnitud = conteo_saltos * params.mu_j
        if params.sigma_j > 0:
            magnitud = magnitud + np.sqrt(conteo_saltos) * params.sigma_j * (
                rng.standard_normal(forma)
            )

    return np.exp(np.cumsum(difusion + magnitud, axis=1))


def resumir(paths_cartera: np.ndarray, paths_pasivo: np.ndarray) -> RiskSummary:
    """El déficit de poder adquisitivo: cuánto queda la cartera por debajo del pasivo."""
    razon = paths_cartera / paths_pasivo

    percentiles = {
        clave: [float(v) for v in np.percentile(razon, q, axis=0)]
        for clave, q in (("p5", 5), ("p25", 25), ("p50", 50), ("p75", 75), ("p95", 95))
    }

    final = razon[:, -1]
    # Pérdida positiva = poder adquisitivo perdido al cierre del horizonte.
    perdidas = 1.0 - final
    var_95 = float(np.percentile(perdidas, 95))
    cola = perdidas[perdidas >= var_95]
    cvar_95 = float(cola.mean()) if cola.size else var_95

    return RiskSummary(
        percentiles=percentiles,
        var_95=var_95,
        cvar_95=cvar_95,
        media_final=float(final.mean()),
    )
