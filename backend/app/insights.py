from __future__ import annotations

from dataclasses import dataclass
from collections import defaultdict


@dataclass(frozen=True)
class GastoHormigaItem:
    descripcion: str
    monto_total: float
    frecuencia: int
    monto_promedio: float


@dataclass(frozen=True)
class SuscripcionItem:
    servicio: str
    monto_estimado: float
    rubro: str


@dataclass(frozen=True)
class StatementInsightsResult:
    total_egresos: float
    total_ingresos: float
    ahorro_potencial_mensual: float
    tasa_ahorro_estimada_pct: float
    gastos_hormiga_total: float
    gastos_hormiga_porcentaje: float
    gastos_hormiga_top: list[GastoHormigaItem]
    suscripciones: list[SuscripcionItem]
    top_comercios: list[dict]
    diagnostico_fugas: str


def analizar_insights_transacciones(
    transacciones: list[dict],
    umbral_hormiga: float = 120.0,
) -> StatementInsightsResult:
    if not transacciones:
        return StatementInsightsResult(
            total_egresos=0.0,
            total_ingresos=0.0,
            ahorro_potencial_mensual=0.0,
            tasa_ahorro_estimada_pct=0.0,
            gastos_hormiga_total=0.0,
            gastos_hormiga_porcentaje=0.0,
            gastos_hormiga_top=[],
            suscripciones=[],
            top_comercios=[],
            diagnostico_fugas="Sin transacciones para analizar.",
        )

    egresos_total = 0.0
    ingresos_total = 0.0
    hormiga_total = 0.0

    agrupado_hormiga = defaultdict(list)
    comercios_total = defaultdict(float)
    suscripciones_detectadas = []

    keywords_suscripciones = {
        "NETFLIX": "otros",
        "SPOTIFY": "otros",
        "DISNEY": "otros",
        "HBO": "otros",
        "PRIME": "otros",
        "YOUTUBE": "otros",
        "APPLE": "otros",
        "CFE": "vivienda",
        "IZZI": "vivienda",
        "TOTALPLAY": "vivienda",
        "TELMEX": "vivienda",
        "SMART FIT": "salud",
        "GIMNASIO": "salud",
    }

    for tx in transacciones:
        desc = str(tx.get("descripcion", "")).strip().upper()
        monto = float(tx.get("monto", 0.0))

        if monto < 0:
            ingresos_total += abs(monto)
        elif monto > 0:
            egresos_total += monto
            comercios_total[desc] += monto

            # Detección gasto hormiga (< umbral y no recurrente grande)
            if monto <= umbral_hormiga:
                hormiga_total += monto
                agrupado_hormiga[desc].append(monto)

            # Detección suscripciones
            for kw, rub in keywords_suscripciones.items():
                if kw in desc:
                    suscripciones_detectadas.append(
                        SuscripcionItem(
                            servicio=desc,
                            monto_estimado=round(monto, 2),
                            rubro=rub,
                        )
                    )
                    break

    # Top gastos hormiga
    top_hormiga = []
    for desc, montos in sorted(agrupado_hormiga.items(), key=lambda item: sum(item[1]), reverse=True)[:6]:
        top_hormiga.append(
            GastoHormigaItem(
                descripcion=desc,
                monto_total=round(sum(montos), 2),
                frecuencia=len(montos),
                monto_promedio=round(sum(montos) / len(montos), 2),
            )
        )

    # Top comercios
    top_com = [
        {"comercio": desc, "monto_total": round(total, 2), "participacion_pct": round(total / egresos_total, 4)}
        for desc, total in sorted(comercios_total.items(), key=lambda x: x[1], reverse=True)[:5]
    ] if egresos_total > 0 else []

    pct_hormiga = round(hormiga_total / egresos_total, 4) if egresos_total > 0 else 0.0
    ahorro_potencial = round(hormiga_total * 0.70, 2)  # Asumir que se puede recortar 70% del gasto hormiga
    tasa_ahorro = round((ingresos_total - egresos_total) / ingresos_total, 4) if ingresos_total > egresos_total else 0.0

    diagnostico = (
        f"Se detectaron ${hormiga_total:,.2f} MXN en gastos hormiga ({pct_hormiga*100:.1f}% de tus egresos). "
        f"Redirigir este capital a Cetes o Udibonos generaría un colchón de protección real inmediato."
    )

    return StatementInsightsResult(
        total_egresos=round(egresos_total, 2),
        total_ingresos=round(ingresos_total, 2),
        ahorro_potencial_mensual=ahorro_potencial,
        tasa_ahorro_estimada_pct=tasa_ahorro,
        gastos_hormiga_total=round(hormiga_total, 2),
        gastos_hormiga_porcentaje=pct_hormiga,
        gastos_hormiga_top=top_hormiga,
        suscripciones=suscripciones_detectadas,
        top_comercios=top_com,
        diagnostico_fugas=diagnostico,
    )
