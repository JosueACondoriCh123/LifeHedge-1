"""Genera los estados de cuenta de muestra que garantizan la demo.

Correr con: python -m scripts.make_samples
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from reportlab.lib.pagesizes import LETTER  # noqa: E402
from reportlab.pdfgen import canvas  # noqa: E402

from app.config import settings  # noqa: E402

MUESTRAS: dict[str, tuple[str, list[tuple[str, str, float]]]] = {
    "bbva_familia": (
        "BBVA MEXICO - ESTADO DE CUENTA",
        [
            ("05/01/2026", "OXXO SUC 4412 CULIACAN", 480.00),
            ("07/01/2026", "SORIANA HIPER LOMAS", 3120.50),
            ("08/01/2026", "CFE SUMINISTRO BASICO", 1840.00),
            ("10/01/2026", "RENTA DEPARTAMENTO ENE", 9500.00),
            ("11/01/2026", "GASOLINERA PEMEX 4411", 1250.00),
            ("13/01/2026", "UBER TRIP MX", 289.00),
            ("15/01/2026", "FARMACIA GUADALAJARA", 640.00),
            ("18/01/2026", "COLEGIATURA COLEGIO SAN JOSE", 4200.00),
            ("20/01/2026", "TORTILLERIA LA ESPIGA", 210.00),
            ("22/01/2026", "COPPEL ABONO QUINCENAL", 899.00),
            ("25/01/2026", "PAGO RECIBIDO GRACIAS", -12000.00),
            ("28/01/2026", "TOTALPLAY INTERNET", 649.00),
        ],
    ),
    "santander_joven": (
        "SANTANDER MEXICO - ESTADO DE CUENTA",
        [
            ("03/01/2026", "UBER EATS MX", 320.00),
            ("06/01/2026", "OXXO SUC 8891", 185.00),
            ("09/01/2026", "RENTA CUARTO COMPARTIDO", 4500.00),
            ("12/01/2026", "DIDI MX", 410.00),
            ("14/01/2026", "STARBUCKS REFORMA", 275.00),
            ("17/01/2026", "UDEMY CURSO PYTHON", 399.00),
            ("19/01/2026", "GASOLINERA SHELL", 700.00),
            ("23/01/2026", "FARMACIA SIMILARES", 180.00),
            ("26/01/2026", "IZZI TELECOM", 499.00),
            ("29/01/2026", "PAGO RECIBIDO", -5000.00),
        ],
    ),
    "banorte_hogar": (
        "BANORTE - ESTADO DE CUENTA",
        [
            ("04/01/2026", "CHEDRAUI SELECTO", 2890.00),
            ("06/01/2026", "MERCADO MUNICIPAL", 640.00),
            ("08/01/2026", "AGUA JAPAC BIMESTRAL", 420.00),
            ("09/01/2026", "CFE SUMINISTRO", 2210.00),
            ("11/01/2026", "HIPOTECA INFONAVIT", 6800.00),
            ("13/01/2026", "TAG IAVE RECARGA", 500.00),
            ("16/01/2026", "HOSPITAL ANGELES CONSULTA", 1500.00),
            ("18/01/2026", "PAPELERIA LUMEN", 320.00),
            ("21/01/2026", "GASOLINERA PEMEX", 1600.00),
            ("24/01/2026", "TAQUERIA EL FOGON", 380.00),
            ("27/01/2026", "PAGO RECIBIDO NOMINA", -18000.00),
        ],
    ),
}


def construir(nombre: str, encabezado: str, filas: list[tuple[str, str, float]]) -> Path:
    destino = settings.samples_dir / f"{nombre}.pdf"
    destino.parent.mkdir(parents=True, exist_ok=True)

    c = canvas.Canvas(str(destino), pagesize=LETTER)
    _, alto = LETTER

    c.setFont("Helvetica-Bold", 13)
    c.drawString(60, alto - 60, encabezado)
    c.setFont("Helvetica", 9)
    c.drawString(60, alto - 78, "PERIODO 01/01/2026 AL 31/01/2026")
    c.drawString(60, alto - 92, "FECHA       DESCRIPCION                              IMPORTE")

    y = alto - 112
    c.setFont("Helvetica", 9)
    for fecha, descripcion, monto in filas:
        c.drawString(60, y, fecha)
        c.drawString(130, y, descripcion[:44])
        c.drawRightString(540, y, f"{monto:,.2f}")
        y -= 15

    c.save()
    return destino


def main() -> int:
    for nombre, (encabezado, filas) in MUESTRAS.items():
        print(f"escrito {construir(nombre, encabezado, filas)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
