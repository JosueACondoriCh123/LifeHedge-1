from __future__ import annotations

import re
import unicodedata

from app.config import RUBROS

# El orden importa: la primera regla que coincide gana.
REGLAS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "alimentos",
        (
            "OXXO", "SORIANA", "WALMART", "BODEGA AURRERA", "CHEDRAUI", "LA COMER",
            "SUPERAMA", "COSTCO", "SAMS", "TORTILLERIA", "CARNICERIA", "FRUTERIA",
            "MERCADO", "RESTAURANTE", "TAQUERIA", "STARBUCKS", "RAPPI", "DIDI FOOD",
            "UBER EATS", "SEVEN ELEVEN", "7 ELEVEN", "CIRCULO K",
        ),
    ),
    (
        "vivienda",
        (
            "CFE", "RENTA", "ARRENDAMIENTO", "AGUA", "JAPAC", "SACMEX", "GAS NATURAL",
            "GAS LP", "TELMEX", "TOTALPLAY", "IZZI", "MEGACABLE", "PREDIAL",
            "MANTENIMIENTO CONDOMINIO", "HIPOTECA", "INFONAVIT", "HOME DEPOT",
        ),
    ),
    (
        "transporte",
        (
            "UBER", "DIDI", "CABIFY", "PEMEX", "GASOLINERA", "BP", "SHELL", "MOBIL",
            "TAG IAVE", "PASE URBANO", "ESTACIONAMIENTO", "METRO", "AUTOBUS", "ADO",
            "AEROMEXICO", "VOLARIS", "VIVA AEROBUS", "TALLER MECANICO", "VERIFICACION",
        ),
    ),
    (
        "salud",
        (
            "FARMACIA", "SIMILARES", "BENAVIDES", "GUADALAJARA", "SAN PABLO", "HOSPITAL",
            "CLINICA", "LABORATORIO", "DENTISTA", "CONSULTORIO", "OPTICA", "IMSS",
            "SEGURO GASTOS MEDICOS",
        ),
    ),
    (
        "educacion",
        (
            "COLEGIATURA", "UNIVERSIDAD", "INSTITUTO", "COLEGIO", "ESCUELA", "KINDER",
            "PAPELERIA", "LIBRERIA", "GANDHI", "UDEMY", "COURSERA", "INSCRIPCION",
        ),
    ),
)

FALLBACK = "otros"

# Los patrones se comparan con límites de palabra, no como subcadenas sueltas.
# Marcas cortas como "ADO" o "BP" aparecen dentro de palabras comunes en español
# ("registrADO", "abonADO"), y una coincidencia parcial mandaría transacciones al
# rubro equivocado sin que nada falle a la vista.
_COMPILADAS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (rubro, re.compile(r"\b(?:" + "|".join(re.escape(p) for p in patrones) + r")\b"))
    for rubro, patrones in REGLAS
)


def _normalizar(texto: str) -> str:
    sin_acentos = unicodedata.normalize("NFKD", texto)
    sin_acentos = "".join(c for c in sin_acentos if not unicodedata.combining(c))
    return sin_acentos.upper()


def categorizar(descripcion: str) -> str:
    normalizada = _normalizar(descripcion)
    for rubro, patron in _COMPILADAS:
        if patron.search(normalizada):
            return rubro
    return FALLBACK


def pesos_por_rubro(transacciones: list[tuple[str, float]]) -> dict[str, float]:
    totales = {rubro: 0.0 for rubro in RUBROS}
    for descripcion, monto in transacciones:
        if monto > 0:
            totales[categorizar(descripcion)] += monto

    gran_total = sum(totales.values())
    if gran_total <= 0:
        raise ValueError("No se encontraron cargos positivos en el estado de cuenta.")

    return {rubro: total / gran_total for rubro, total in totales.items()}
