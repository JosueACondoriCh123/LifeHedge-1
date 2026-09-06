from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent

RUBROS: tuple[str, ...] = (
    "alimentos",
    "vivienda",
    "transporte",
    "salud",
    "educacion",
    "otros",
)

# Orden canónico del universo de activos. Toda matriz y todo vector de pesos
# lo respeta. Las dos primeras patas vienen de Banxico porque Yahoo no tiene
# historia de los ETFs mexicanos de udibonos y cetes (UDITRACISHRS.MX y
# CETETRCISHRS.MX devuelven una sola observación); el resto viene de Yahoo.
TICKERS: tuple[str, ...] = (
    "UDIBONO",
    "CETES28",
    "NAFTRACISHRS.MX",
    "IVVPESOISHRS.MX",
    "GLD",
    "XLE",
    "DBA",
    "MXN=X",
)

BANXICO_TICKERS: frozenset[str] = frozenset({"UDIBONO", "CETES28"})

# Tickers cotizados en USD que hay que convertir a MXN.
USD_TICKERS: frozenset[str] = frozenset({"GLD", "XLE", "DBA"})

FX_TICKER = "MXN=X"

# Series del SIE de Banxico. Se verifican con scripts/verificar_fuentes.py.
BANXICO_SERIES: dict[str, str] = {
    "udi": "SP68257",  # Valor de la UDI
    "cetes28": "SF43936",  # Cetes 28 días, tasa de rendimiento
}

# Etiquetas legibles, en el orden canónico de TICKERS.
TICKER_LABELS: dict[str, str] = {
    "UDIBONO": "Udibonos",
    "CETES28": "Cetes 28d",
    "NAFTRACISHRS.MX": "IPC",
    "IVVPESOISHRS.MX": "S&P 500 (MXN)",
    "GLD": "Oro",
    "XLE": "Energía",
    "DBA": "Agro",
    "MXN=X": "USD/MXN",
}

# Indicadores del Banco de Información Económica de INEGI (INPC base 2018).
# Los ids se verifican en la Task 4; si un id resulta inválido, el snapshot
# commiteado mantiene el sistema funcionando.
INEGI_INDICATORS: dict[str, str] = {
    "general": "628194",
    "alimentos": "628195",
    "vivienda": "628200",
    "transporte": "628203",
    "salud": "628202",
    "educacion": "628205",
    "otros": "628206",
}

INEGI_AREA = "0700"  # nacional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    inegi_token: str | None = None
    banxico_token: str | None = None
    supabase_jwt_secret: str | None = None
    # URL del proyecto: de aquí sale el JWKS con la clave pública ES256.
    supabase_url: str | None = None
    cors_origins_raw: str = "http://localhost:5173"
    market_ttl_seconds: int = 60 * 60 * 24
    inpc_ttl_seconds: int = 60 * 60 * 24 * 7
    external_timeout_seconds: float = 12.0

    @property
    def cors_origins(self) -> list[str]:
        return [
            origen.strip()
            for origen in self.cors_origins_raw.split(",")
            if origen.strip()
        ]

    @property
    def rubros(self) -> tuple[str, ...]:
        return RUBROS

    @property
    def tickers(self) -> tuple[str, ...]:
        return TICKERS

    @property
    def cash_ticker(self) -> str:
        return "CETES28"

    @property
    def cash_index(self) -> int:
        return TICKERS.index(self.cash_ticker)

    @property
    def cache_dir(self) -> Path:
        return BASE_DIR / "data" / "cache"

    @property
    def snapshot_dir(self) -> Path:
        return BASE_DIR / "data" / "snapshot"

    @property
    def samples_dir(self) -> Path:
        return BASE_DIR / "data" / "samples"


settings = Settings()
