"""Comprueba que cada fuente externa responde y trae historia utilizable.

Correr con: python -m scripts.verificar_fuentes

Es el diagnóstico a mano antes de generar los snapshots: dice exactamente cuál
ticker, indicador o serie está roto, en vez de dejar que build_snapshot falle
con un mensaje agregado.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import (  # noqa: E402
    BANXICO_SERIES,
    BANXICO_TICKERS,
    INEGI_INDICATORS,
    TICKERS,
    settings,
)

OK = "OK   "
FALLA = "FALLA"


def _linea(estado: str, nombre: str, detalle: str) -> None:
    print(f"{estado}  {nombre:24s} {detalle}")


def revisar_yahoo() -> int:
    from app.yahoo import niveles_mensuales

    print("\n== Yahoo (ETFs y tipo de cambio) ==")
    fallos = 0
    for ticker in TICKERS:
        if ticker in BANXICO_TICKERS:
            continue
        try:
            niveles = niveles_mensuales(ticker)
            meses = sorted(niveles)
            _linea(OK, ticker, f"{len(meses):4d} meses  {meses[0]} -> {meses[-1]}")
        except Exception as exc:
            _linea(FALLA, ticker, f"{type(exc).__name__}: {exc}")
            fallos += 1
    return fallos


def revisar_banxico() -> int:
    from app.banxico import _fetch_serie

    print("\n== Banxico SIE (udibonos y cetes) ==")
    if not settings.banxico_token:
        _linea(FALLA, "BANXICO_TOKEN", "no configurado")
        return 1

    fallos = 0
    for nombre, serie in BANXICO_SERIES.items():
        try:
            datos = _fetch_serie(
                serie, settings.banxico_token, "2015-01-01", "2100-01-01"
            )
            meses = sorted(datos)
            _linea(
                OK,
                f"{nombre} ({serie})",
                f"{len(meses):4d} meses  {meses[0]} -> {meses[-1]}",
            )
        except Exception as exc:
            _linea(FALLA, f"{nombre} ({serie})", f"{type(exc).__name__}: {exc}")
            fallos += 1
    return fallos


def revisar_inegi() -> int:
    from app.inpc import _fetch_serie

    print("\n== INEGI BIE (INPC por rubro) ==")
    if not settings.inegi_token:
        _linea(FALLA, "INEGI_TOKEN", "no configurado")
        return 1

    fallos = 0
    for clave, indicador in INEGI_INDICATORS.items():
        try:
            datos = _fetch_serie(indicador, settings.inegi_token)
            periodos = sorted(datos)
            _linea(
                OK,
                f"{clave} ({indicador})",
                f"{len(periodos):4d} periodos  {periodos[0]} -> {periodos[-1]}",
            )
        except Exception as exc:
            _linea(FALLA, f"{clave} ({indicador})", f"{type(exc).__name__}: {exc}")
            fallos += 1
    return fallos


def main() -> int:
    fallos = revisar_yahoo() + revisar_banxico() + revisar_inegi()
    print()
    if fallos:
        print(f"{fallos} fuente(s) con problema. Corrige antes de build_snapshot.")
        return 1
    print("Todas las fuentes responden. Puedes correr: python -m scripts.build_snapshot")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
