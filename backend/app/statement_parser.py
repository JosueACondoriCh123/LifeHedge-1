from __future__ import annotations

import io
import json
import logging
import re
from dataclasses import dataclass

import pdfplumber
import requests

from app.categorizer import categorizar, pesos_por_rubro
from app.config import RUBROS, settings


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
    ("BANCOPPEL", "BANCOPPEL"),
    ("COPPEL", "BANCOPPEL"),
    ("NU", "NU"),
    ("NUBANK", "NU"),
    ("HEY BANCO", "HEY BANCO"),
    ("MERCADO PAGO", "MERCADO PAGO"),
    ("MERCADOPAGO", "MERCADO PAGO"),
    ("INBURSA", "INBURSA"),
    ("BANREGIO", "BANREGIO"),
    ("AFIRME", "AFIRME"),
    ("INTERCAM", "INTERCAM"),
    ("KLAR", "KLAR"),
    ("STP", "STP"),
)

# fecha (dd/mm/aaaa o dd/mm/aa) + descripción + importe con signo opcional
LINEA = re.compile(
    r"^\s*(?P<fecha>\d{2}/\d{2}/\d{2,4})\s+"
    r"(?P<descripcion>.+?)\s+"
    r"(?P<monto>-?\$?\s?[\d,]+\.\d{2})\s*$"
)

# Patrones alternativos para tolerar guiones, saldos posteriores o importes en paréntesis
LINEAS_ALTERNATIVAS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"^\s*(?P<fecha>\d{2,4}[/-]\d{2}[/-]\d{2,4})\s+"
        r"(?P<descripcion>.+?)\s+"
        r"(?P<monto>-?\$?\s?[\d,]+\.\d{2})\s*$"
    ),
    re.compile(
        r"^\s*(?P<fecha>\d{2,4}[/-]\d{2}[/-]\d{2,4})\s+"
        r"(?P<descripcion>.+?)\s+"
        r"(?P<monto>-?\$?\s?[\d,]+\.\d{2})\s+"
        r"(?:\$?\s?[\d,]+\.\d{2}|\b[A-Z0-9_-]+\b)\s*$"
    ),
    re.compile(
        r"^\s*(?P<fecha>\d{2,4}[/-]\d{2}[/-]\d{2,4})\s+"
        r"(?P<descripcion>.+?)\s+"
        r"\((?P<monto>\$?\s?[\d,]+\.\d{2})\)\s*$"
    ),
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
    # Priorizar las primeras 5 líneas de encabezado para evitar que conceptos de gasto
    # (ej. 'COPPEL ABONO' en un estado BBVA) confundan al emisor
    primeras_lineas = "\n".join(texto.splitlines()[:5]).upper()
    for firma, emisor in FIRMAS_EMISOR:
        if firma in primeras_lineas:
            return emisor

    en_mayusculas = texto.upper()
    for firma, emisor in FIRMAS_EMISOR:
        if firma in en_mayusculas:
            return emisor
    return "GENERICO"


def _a_float(crudo: str, es_parentesis: bool = False) -> float:
    limpio = (
        crudo.replace("$", "")
        .replace(",", "")
        .replace(" ", "")
        .replace("MXN", "")
    )
    val = float(limpio)
    return -val if es_parentesis else val


def parse_con_minimax(texto: str) -> tuple[str, list[Transaccion]] | None:
    """Extrae transacciones bancarias usando MiniMax M3 Free vía OpenRouter."""
    token = settings.openrouter_api_key
    if not token:
        return None

    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lifehedge.mx",
        "X-Title": "LifeHedge Statement Reader",
    }
    prompt = (
        "Analiza el siguiente texto de un estado de cuenta bancario mexicano. "
        "Devuelve estrictamente un JSON válido con la lista de movimientos y el emisor (ej. BANCOPPEL, BBVA, SANTANDER, etc.):\n"
        '{\n  "emisor": "BANCO",\n  "transacciones": [\n    {"fecha": "dd/mm/aaaa", "descripcion": "concepto", "monto": 123.45, "rubro": "alimentos|vivienda|transporte|salud|educacion|otros"}\n  ]\n}'
    )
    payload = {
        "model": settings.openrouter_statement_model,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": texto[:8000]},
        ],
        "temperature": 0.1,
    }
    try:
        r = requests.post(url, headers=headers, json=payload, timeout=8.0)
        if r.status_code == 200:
            data = r.json()
            raw = data["choices"][0]["message"]["content"].strip()
            if raw.startswith("```"):
                lines = raw.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                raw = "\n".join(lines).strip()
            obj = json.loads(raw)
            emisor = str(obj.get("emisor") or "").upper().strip() or _detectar_emisor(texto)
            txs = [
                Transaccion(
                    fecha=str(item.get("fecha", "01/01/2026")),
                    descripcion=str(item.get("descripcion", "")).strip(),
                    monto=float(item.get("monto", 0.0)),
                    rubro=str(item.get("rubro", "")).lower()
                    if str(item.get("rubro", "")).lower() in RUBROS
                    else categorizar(str(item.get("descripcion", ""))),
                )
                for item in obj.get("transacciones", [])
                if item.get("descripcion") and item.get("monto") is not None
            ]
            if txs:
                return emisor, txs
    except Exception as exc:
        logging.getLogger("lifehedge").info("Fallback de MiniMax M3 a parser local: %s", exc)
    return None


def parse_pdf(contenido: bytes, use_ai: bool = False) -> ParsedStatement:
    texto = _extraer_texto(contenido)

    if use_ai:
        ai_res = parse_con_minimax(texto)
        if ai_res:
            emisor_ai, txs_ai = ai_res
            try:
                pesos_ai = pesos_por_rubro([(t.descripcion, t.monto) for t in txs_ai])
                return ParsedStatement(emisor=emisor_ai, transacciones=txs_ai, pesos=pesos_ai)
            except Exception:
                pass

    emisor = _detectar_emisor(texto)

    transacciones: list[Transaccion] = []
    for linea in texto.splitlines():
        match = LINEA.match(linea)
        es_parentesis = False
        if match is None:
            for alt in LINEAS_ALTERNATIVAS:
                m_alt = alt.match(linea)
                if m_alt is not None:
                    match = m_alt
                    if "(" in linea and ")" in linea:
                        es_parentesis = True
                    break

        if match is None:
            continue

        descripcion = " ".join(match.group("descripcion").split())
        monto = _a_float(match.group("monto"), es_parentesis=es_parentesis)
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
