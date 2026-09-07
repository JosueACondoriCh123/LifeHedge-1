from __future__ import annotations

from typing import Any

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


# --- Modelos para Rebalanceo ---
class RebalanceRequest(BaseModel):
    capital_total: float = Field(default=100000.0, gt=0)
    portafolio_actual: dict[str, float] = Field(default_factory=dict)
    target_weights: list[float]
    comision_broker_pct: float = Field(default=0.0025, ge=0.0, le=0.05)
    umbral_drift: float = Field(default=0.05, ge=0.0, le=0.5)


class OrdenEjecucionOut(BaseModel):
    ticker: str
    label: str
    accion: str
    monto_actual_mxn: float
    monto_objetivo_mxn: float
    delta_mxn: float
    peso_actual_pct: float
    peso_objetivo_pct: float
    titulos_estimados: int
    precio_referencia_mxn: float
    comision_estimada_mxn: float


class RebalanceResponse(BaseModel):
    capital_total: float
    drift_score: float
    requiere_rebalanceo: bool
    costo_comisiones_total: float
    monto_compras_total: float
    monto_ventas_total: float
    ordenes: list[OrdenEjecucionOut]


# --- Modelos para Backtesting ---
class BacktestRequest(BaseModel):
    pesos: dict[str, float] = Field(default_factory=dict)
    optimal_weights: list[float]
    meses_ventana: int = Field(default=36, ge=12, le=120)


class MetricasEstrategiaOut(BaseModel):
    nombre: str
    etiqueta: str
    retorno_acumulado: float
    cagr: float
    volatilidad_anual: float
    sharpe: float
    sortino: float
    max_drawdown: float
    calmar: float
    trayectoria_base100: list[float]


class BacktestResponse(BaseModel):
    fechas: list[str]
    meses_evaluados: int
    estrategias: list[MetricasEstrategiaOut]
    ganancia_poder_adquisitivo_real: float
    estrategia_optima_recomendada: str


# --- Modelos para Stress Testing ---
class StressSimulateRequest(BaseModel):
    pesos: dict[str, float] = Field(default_factory=dict)
    optimal_weights: list[float]


class StressScenarioOut(BaseModel):
    clave_escenario: str
    nombre: str
    descripcion: str
    retorno_cartera_estres: float
    retorno_pasivo_estres: float
    delta_estresado: float
    phe_estresado: float
    resiliencia: str
    recomendacion: str



class StressSimulateResponse(BaseModel):
    escenarios: list[StressScenarioOut]
    escenario_mas_vulnerable: str
    escenario_mas_favorable: str
    resiliencia_promedio_cartera: float


# --- Modelos para Insights y Gasto Hormiga ---
class TransaccionIn(BaseModel):
    fecha: str = ""
    descripcion: str
    monto: float
    rubro: str = "otros"


class StatementInsightsRequest(BaseModel):
    transacciones: list[TransaccionIn]
    umbral_hormiga: float = Field(default=120.0, ge=10.0, le=1000.0)


class GastoHormigaOut(BaseModel):
    descripcion: str
    monto_total: float
    frecuencia: int
    monto_promedio: float


class SuscripcionOut(BaseModel):
    servicio: str
    monto_estimado: float
    rubro: str


class TopComercioOut(BaseModel):
    comercio: str
    monto_total: float
    participacion_pct: float



class StatementInsightsResponse(BaseModel):
    total_egresos: float
    total_ingresos: float
    ahorro_potencial_mensual: float
    tasa_ahorro_estimada_pct: float
    gastos_hormiga_total: float
    gastos_hormiga_porcentaje: float
    gastos_hormiga_top: list[GastoHormigaOut]
    suscripciones: list[SuscripcionOut]
    top_comercios: list[TopComercioOut]
    diagnostico_fugas: str


# --- Reporte Ejecutivo y Diagnósticos ---
class ExecutiveReportRequest(BaseModel):
    pesos: dict[str, float]
    buffer: float = Field(default=0.10, ge=0.0, le=1.0)
    capital_total: float = Field(default=100000.0, gt=0)
    horizonte: int = Field(default=12, ge=1, le=60)
    transacciones: list[TransaccionIn] = Field(default_factory=list)


class ExecutiveReportResponse(BaseModel):
    perfil_inversionista: str
    resumen_ejecutivo: str
    kpis_clave: dict[str, float | str]
    composicion_optima: list[dict]
    diagnostico_estres: str
    plan_accion_recomendado: list[str]
    timestamp: str


class SystemDiagnosticsResponse(BaseModel):
    status: str
    version: str
    market_data: dict
    liability_data: dict
    models_available: list[str]
    ai_provider: str
    timestamp: str


# --- Modelos para Acoplamiento Dinámico y Cartera Base ---
class ActivoCouplingOut(BaseModel):
    ticker: str
    label: str
    volatilidad_anual: float


class RubroCouplingOut(BaseModel):
    rubro: str
    volatilidad_anual: float


class CouplingResponse(BaseModel):
    meses_observados: int
    periodo: str
    activos: list[ActivoCouplingOut]
    rubros: list[RubroCouplingOut]
    matriz_correlacion: dict[str, dict[str, float]]
    matriz_covarianza_mensual: dict[str, dict[str, float]]
    volatilidades_activos: dict[str, float]
    volatilidades_rubros: dict[str, float]


class BaselinePortfolioResponse(BaseModel):
    pesos: dict[str, float]
    inflacion: dict[str, Any]
    optimo: dict[str, Any]
    riesgo: dict[str, Any]
    buffer: float
    horizonte: int
    fuente: str


class EndpointPingOut(BaseModel):
    nombre: str
    endpoint: str
    status: str
    latencia_ms: float
    tipo: str
    descripcion: str


class ApiDiagnosticsPingResponse(BaseModel):
    timestamp: str
    endpoints: list[EndpointPingOut]
    tiempo_total_ms: float
    sistema_operativo: bool


