from __future__ import annotations

import io
import re
from dataclasses import dataclass

import pdfplumber

from app.categorizer import categorizar, pesos_por_rubro


class PdfIlegible(ValueError):
    """El PDF no tiene texto extraíble o no contiene transacciones."""


@dataclass(frozen=True)
class Transaccion:
    fecha: str
    descripcion: str
    monto: float
    rubro: str


@dataclass(frozen=True)
class ParsedStatement:
    emisor: str
    transacciones: list[Transaccion]
    pesos: dict[str, float]


FIRMAS_EMISOR: tuple[tuple[str, str], ...] = (
    ("BBVA", "BBVA"),
    ("SANTANDER", "SANTANDER"),
    ("BANORTE", "BANORTE"),
    ("HSBC", "HSBC"),
    ("CITIBANAMEX", "CITIBANAMEX"),
    ("BANAMEX", "CITIBANAMEX"),
    ("SCOTIABANK", "SCOTIABANK"),
)

# fecha (dd/mm/aaaa o dd/mm/aa) + descripción + importe con signo opcional
LINEA = re.compile(
    r"^\s*(?P<fecha>\d{2}/\d{2}/\d{2,4})\s+"
    r"(?P<descripcion>.+?)\s+"
    r"(?P<monto>-?\$?\s?[\d,]+\.\d{2})\s*$"
)


def _extraer_texto(contenido: bytes) -> str:
    try:
        with pdfplumber.open(io.BytesIO(contenido)) as pdf:
            paginas = [pagina.extract_text() or "" for pagina in pdf.pages]
    except Exception as exc:
        raise PdfIlegible(
            "No pudimos leer el PDF. Verifica que sea un estado de cuenta digital "
            "(no una foto o un escaneo), o usa un estado de cuenta demo."
        ) from exc

    texto = "\n".join(paginas)
    if not texto.strip():
        raise PdfIlegible(
            "El PDF no contiene texto seleccionable; parece un escaneo. "
            "Usa un estado de cuenta demo para ver LifeHedge en acción."
        )
    return texto


def _detectar_emisor(texto: str) -> str:
    en_mayusculas = texto.upper()
    for firma, emisor in FIRMAS_EMISOR:
        if firma in en_mayusculas:
            return emisor
    return "GENERICO"


def _a_float(crudo: str) -> float:
    return float(crudo.replace("$", "").replace(",", "").replace(" ", ""))


def parse_pdf(contenido: bytes) -> ParsedStatement:
    texto = _extraer_texto(contenido)
    emisor = _detectar_emisor(texto)

    transacciones: list[Transaccion] = []
    for linea in texto.splitlines():
        match = LINEA.match(linea)
        if match is None:
            continue
        descripcion = " ".join(match.group("descripcion").split())
        monto = _a_float(match.group("monto"))
        transacciones.append(
            Transaccion(
                fecha=match.group("fecha"),
                descripcion=descripcion,
                monto=monto,
                rubro=categorizar(descripcion),
            )
        )

    if not transacciones:
        raise PdfIlegible(
            "No encontramos movimientos con el formato esperado en este PDF. "
            "Prueba con otro estado de cuenta o usa uno de los demo."
        )

    pesos = pesos_por_rubro([(t.descripcion, t.monto) for t in transacciones])
    return ParsedStatement(emisor=emisor, transacciones=transacciones, pesos=pesos)
