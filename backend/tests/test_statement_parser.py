import pytest

from app.config import RUBROS, settings
from app.statement_parser import PdfIlegible, parse_pdf


def _leer(nombre):
    return (settings.samples_dir / nombre).read_bytes()


def test_parsea_la_muestra_de_bbva():
    resultado = parse_pdf(_leer("bbva_familia.pdf"))

    assert resultado.emisor == "BBVA"
    # 12 filas en el PDF, incluido un abono negativo.
    assert len(resultado.transacciones) == 12
    assert abs(sum(resultado.pesos.values()) - 1.0) < 1e-9
    assert set(resultado.pesos) == set(RUBROS)


def test_detecta_emisor_santander():
    assert parse_pdf(_leer("santander_joven.pdf")).emisor == "SANTANDER"


def test_detecta_emisor_banorte():
    assert parse_pdf(_leer("banorte_hogar.pdf")).emisor == "BANORTE"


def test_transacciones_traen_rubro_asignado():
    resultado = parse_pdf(_leer("bbva_familia.pdf"))

    por_descripcion = {t.descripcion: t.rubro for t in resultado.transacciones}
    assert por_descripcion["CFE SUMINISTRO BASICO"] == "vivienda"
    assert por_descripcion["UBER TRIP MX"] == "transporte"


def test_pdf_sin_texto_extraible_levanta_pdf_ilegible():
    with pytest.raises(PdfIlegible):
        parse_pdf(b"%PDF-1.4 esto no es un pdf valido")
