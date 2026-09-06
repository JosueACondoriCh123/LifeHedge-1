from __future__ import annotations

from pydantic import BaseModel, Field


class Asset(BaseModel):
    ticker: str
    label: str


class UniverseResponse(BaseModel):
    assets: list[Asset]
    dates: list[str]
    returns: dict[str, list[float]]
    stale: bool
    as_of: str


class TransaccionOut(BaseModel):
    fecha: str
    descripcion: str
    monto: float
    rubro: str


class StatementResponse(BaseModel):
    emisor: str
    transacciones: list[TransaccionOut]
    pesos: dict[str, float]


class PesosRequest(BaseModel):
    pesos: dict[str, float]


class InflationResponse(BaseModel):
    dates: list[str]
    personal: list[float]
    general: list[float]
    delta_anualizado: float
    personal_anual: float
    general_anual: float
    volatilidad_anual: float
    stale: bool
    as_of: str


class OptimizeRequest(BaseModel):
    pesos: dict[str, float]
    buffer: float = Field(default=0.10, ge=0.0, le=1.0)


class Benchmark(BaseModel):
    weights: list[float]
    tev: float
    phe: float


class OptimizeResponse(BaseModel):
    assets: list[Asset]
    weights: list[float]
    tev: float
    phe: float
    benchmark_cetes: Benchmark
    frontera: list[dict]
    stale: bool
    as_of: str


class SimulateRequest(BaseModel):
    pesos: dict[str, float]
    weights: list[float]
    horizonte: int = Field(default=12, ge=1, le=60)


class SimulateResponse(BaseModel):
    percentiles: dict[str, list[float]]
    var_95: float
    cvar_95: float
    media_final: float
    stale: bool
    as_of: str


class RunRequest(BaseModel):
    pesos: dict[str, float]
    buffer: float = Field(default=0.10, ge=0.0, le=1.0)
    horizonte: int = Field(default=12, ge=1, le=60)


class RunResponse(BaseModel):
    inflacion: InflationResponse
    optimo: OptimizeResponse
    riesgo: SimulateResponse
