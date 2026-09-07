from __future__ import annotations

from dataclasses import dataclass
from app.config import TICKERS

ESCENARIOS_MACRO = {
    "SHOCK_TASAS_BANXICO": {
        "nombre": "Shock de Tasas Banxico (+300 bps)",
        "descripcion": "Endurecimiento de política monetaria con subida de +3.00% en la tasa de fondeo",
        "impactos_activos": {
            "UDIBONO": -0.045,
            "CETES28": 0.030,
            "NAFTRACISHRS.MX": -0.082,
            "IVVPESOISHRS.MX": -0.050,
            "GLD": -0.015,
            "XLE": -0.030,
            "DBA": 0.010,
            "MXN=X": -0.040,
        },
        "impacto_pasivo_personal": 0.012,
        "resiliencia_esperada": "ALTA_RESILIENCIA",
        "recomendacion": "Mantener sobreponderación en Cetes 28D y Udibonos de corta duración para capturar el carry soberano sin sufrir minusvalía de duración.",
    },
    "DEVALUACION_USD_MXN": {
        "nombre": "Devaluación del Peso Mexicano (+25%)",
        "descripcion": "Depreciación cambiaria severa que encarece insumos importados y energía",
        "impactos_activos": {
            "UDIBONO": 0.025,
            "CETES28": 0.010,
            "NAFTRACISHRS.MX": -0.065,
            "IVVPESOISHRS.MX": 0.220,
            "GLD": 0.240,
            "XLE": 0.210,
            "DBA": 0.190,
            "MXN=X": 0.250,
        },
        "impacto_pasivo_personal": 0.045,
        "resiliencia_esperada": "COBERTURA_CAMBIARIA_TOTAL",
        "recomendacion": "La exposición en Oro (GLD), S&P 500 y commodities absorbe la depreciación del peso e incrementa el valor en MXN.",
    },
    "PICO_INFLACION_ALIMENTOS": {
        "nombre": "Pico de Inflación en Alimentos (+18%)",
        "descripcion": "Shock agroalimentario por sequías y encarecimiento de granos y fertilizantes",
        "impactos_activos": {
            "UDIBONO": 0.065,
            "CETES28": 0.015,
            "NAFTRACISHRS.MX": -0.040,
            "IVVPESOISHRS.MX": -0.020,
            "GLD": 0.040,
            "XLE": 0.050,
            "DBA": 0.180,
            "MXN=X": 0.030,
        },
        "impacto_pasivo_personal": 0.054,
        "resiliencia_esperada": "COBERTURA_ALIMENTARIA_ACTIVA",
        "recomendacion": "El ETF Agrícola (DBA) y los Udibonos neutralizan el 85% del impacto directo en la canasta básica familiar.",
    },
    "ESTANFLACION_MEXICO": {
        "nombre": "Estanflación en México",
        "descripcion": "Contracción del PIB con inflación persistente por encima del 7.5% anual",
        "impactos_activos": {
            "UDIBONO": 0.040,
            "CETES28": 0.020,
            "NAFTRACISHRS.MX": -0.150,
            "IVVPESOISHRS.MX": -0.080,
            "GLD": 0.110,
            "XLE": 0.080,
            "DBA": 0.070,
            "MXN=X": 0.090,
        },
        "impacto_pasivo_personal": 0.068,
        "resiliencia_esperada": "MODERADA_RESILIENCIA",
        "recomendacion": "Rotar hacia activos reales y deuda indizada al INPC, reduciendo exposición en renta variable doméstica vulnerable.",
    },
    "CRASH_BURSATIL_GLOBAL": {
        "nombre": "Crash Bursátil Global (-35%)",
        "descripcion": "Corrección severa de los mercados accionarios internacionales",
        "impactos_activos": {
            "UDIBONO": 0.015,
            "CETES28": 0.025,
            "NAFTRACISHRS.MX": -0.320,
            "IVVPESOISHRS.MX": -0.350,
            "GLD": 0.140,
            "XLE": -0.220,
            "DBA": -0.100,
            "MXN=X": 0.120,
        },
        "impacto_pasivo_personal": -0.010,
        "resiliencia_esperada": "REFUGIO_SOBERANO_Y_ORO",
        "recomendacion": "El colchón de liquidez en Cetes y el vuelo a la calidad hacia Oro (GLD) amortiguan el drawdown general del patrimonio.",
    },
}


@dataclass(frozen=True)
class StressScenarioResult:
    clave_escenario: str
    nombre: str
    descripcion: str
    retorno_cartera_estres: float
    retorno_pasivo_estres: float
    delta_estresado: float
    phe_estresado: float
    resiliencia: str
    recomendacion: str


def simular_estres_macro(
    pesos_cartera: list[float],
    clave_escenario: str | None = None,
) -> list[StressScenarioResult]:
    if len(pesos_cartera) != len(TICKERS):
        raise ValueError(f"Se esperaban {len(TICKERS)} pesos de cartera.")

    escenarios_a_evaluar = (
        {clave_escenario: ESCENARIOS_MACRO[clave_escenario]}
        if clave_escenario and clave_escenario in ESCENARIOS_MACRO
        else ESCENARIOS_MACRO
    )

    resultados: list[StressScenarioResult] = []
    for clave, esc in escenarios_a_evaluar.items():
        impactos = esc["impactos_activos"]
        # Rendimiento de la cartera = suma ponderada de shocks
        ret_cartera = sum(pesos_cartera[i] * impactos.get(t, 0.0) for i, t in enumerate(TICKERS))
        ret_pasivo = float(esc["impacto_pasivo_personal"])
        delta_estres = ret_cartera - ret_pasivo

        # PHE bajo estrés = 1 - error relativo
        if ret_pasivo > 0:
            phe_estres = max(0.0, min(1.0, 1.0 - abs(delta_estres) / ret_pasivo))
        else:
            phe_estres = 0.75

        resultados.append(
            StressScenarioResult(
                clave_escenario=clave,
                nombre=esc["nombre"],
                descripcion=esc["descripcion"],
                retorno_cartera_estres=round(ret_cartera, 4),
                retorno_pasivo_estres=round(ret_pasivo, 4),
                delta_estresado=round(delta_estres, 4),
                phe_estresado=round(phe_estres, 4),
                resiliencia=esc["resiliencia_esperada"],
                recomendacion=esc["recomendacion"],
            )
        )
    return resultados


@dataclass(frozen=True)
class StressSimulationSummary:
    escenarios: list[StressScenarioResult]
    escenario_mas_vulnerable: str
    escenario_mas_favorable: str
    resiliencia_promedio_cartera: float


def simular_estres(
    optimal_weights: list[float],
    pesos_gasto: dict[str, float] | None = None,
) -> StressSimulationSummary:
    escenarios = simular_estres_macro(optimal_weights)
    mas_vulnerable = min(escenarios, key=lambda s: s.delta_estresado)
    mas_favorable = max(escenarios, key=lambda s: s.delta_estresado)
    promedio_phe = sum(s.phe_estresado for s in escenarios) / len(escenarios) if escenarios else 0.0

    return StressSimulationSummary(
        escenarios=escenarios,
        escenario_mas_vulnerable=mas_vulnerable.nombre,
        escenario_mas_favorable=mas_favorable.nombre,
        resiliencia_promedio_cartera=round(promedio_phe, 4),
    )

