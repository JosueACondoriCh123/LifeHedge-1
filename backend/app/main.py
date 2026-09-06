from __future__ import annotations

import logging
import uuid

import numpy as np
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth import Usuario, limitar_analisis, usuario_actual
from app.cache import DiskCache, NoDataAvailable
from app.config import TICKER_LABELS, TICKERS, settings
from app.inpc import load_inpc
from app.liability import serie_personal
from app.market_data import covariance, load_market, returns_matrix
from app.monte_carlo import calibrar, resumir, simular
from app.optimizer import Infactible, acoplamiento, frontera, metricas, optimizar
from app.schemas import (
    Asset,
    Benchmark,
    InflationResponse,
    OptimizeRequest,
    OptimizeResponse,
    PesosRequest,
    RunRequest,
    RunResponse,
    SimulateRequest,
    SimulateResponse,
    StatementResponse,
    UniverseResponse,
)
from app.statement_parser import PdfIlegible, parse_pdf

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("lifehedge")

app = FastAPI(title="LifeHedge", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

cache = DiskCache(settings.cache_dir, settings.snapshot_dir)

ASSETS = [Asset(ticker=t, label=TICKER_LABELS[t]) for t in TICKERS]


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    correlation_id = uuid.uuid4().hex[:12]
    log.exception("error no manejado id=%s ruta=%s", correlation_id, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Ocurrió un error inesperado en el motor.",
            "correlation_id": correlation_id,
        },
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "lifehedge"}


def _datos():
    """Carga mercado e INPC, propagando 'stale' de forma conservadora."""
    try:
        market = load_market(cache)
        inpc = load_inpc(cache)
    except NoDataAvailable as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "No pudimos cargar los datos de mercado o de INPC. "
                "Intenta en un minuto."
            ),
        ) from exc
    return market, inpc, market.stale or inpc.stale, min(market.as_of, inpc.as_of)


@app.get("/market/universe", response_model=UniverseResponse)
def universe(_usuario: Usuario = Depends(usuario_actual)) -> UniverseResponse:
    market, _, stale, as_of = _datos()
    return UniverseResponse(
        assets=ASSETS,
        dates=market.dates,
        returns=market.returns,
        stale=stale,
        as_of=as_of,
    )


@app.post("/statement/parse", response_model=StatementResponse)
async def statement_parse(
    archivo: UploadFile = File(...),
    _usuario: Usuario = Depends(usuario_actual),
) -> StatementResponse:
    contenido = await archivo.read()
    try:
        parsed = parse_pdf(contenido)
    except PdfIlegible as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return StatementResponse(
        emisor=parsed.emisor,
        transacciones=[t.__dict__ for t in parsed.transacciones],
        pesos=parsed.pesos,
    )


@app.post("/inflation/personal", response_model=InflationResponse)
def inflation_personal(
    payload: PesosRequest,
    _usuario: Usuario = Depends(usuario_actual),
) -> InflationResponse:
    _, inpc, stale, as_of = _datos()
    try:
        resultado = serie_personal(payload.pesos, inpc)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return _respuesta_inflacion(resultado, stale, as_of)


def _respuesta_inflacion(resultado, stale: bool, as_of: str) -> InflationResponse:
    return InflationResponse(**resultado.__dict__, stale=stale, as_of=as_of)


def _entradas_optimizacion(pesos: dict[str, float]):
    market, inpc, stale, as_of = _datos()
    try:
        pasivo = serie_personal(pesos, inpc)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    matriz = returns_matrix(market)
    sigma_a = covariance(matriz)
    try:
        sigma_al, sigma_l2 = acoplamiento(
            matriz, market.dates, pasivo.personal, pasivo.dates
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return market, pasivo, sigma_a, sigma_al, sigma_l2, stale, as_of


@app.post("/portfolio/optimize", response_model=OptimizeResponse)
def portfolio_optimize(
    payload: OptimizeRequest,
    _usuario: Usuario = Depends(usuario_actual),
) -> OptimizeResponse:
    _, _, sigma_a, sigma_al, sigma_l2, stale, as_of = _entradas_optimizacion(
        payload.pesos
    )

    return _respuesta_optimizacion(
        sigma_a,
        sigma_al,
        sigma_l2,
        payload.buffer,
        stale,
        as_of,
    )


def _respuesta_optimizacion(
    sigma_a,
    sigma_al,
    sigma_l2: float,
    buffer: float,
    stale: bool,
    as_of: str,
) -> OptimizeResponse:
    try:
        resultado = optimizar(
            sigma_a, sigma_al, sigma_l2, settings.cash_index, buffer
        )
        puntos = frontera(
            sigma_a, sigma_al, sigma_l2, settings.cash_index, buffer
        )
    except Infactible as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    solo_cetes = np.zeros(len(TICKERS))
    solo_cetes[settings.cash_index] = 1.0
    tev_cetes, phe_cetes = metricas(solo_cetes, sigma_a, sigma_al, sigma_l2)

    return OptimizeResponse(
        assets=ASSETS,
        weights=resultado.weights,
        tev=resultado.tev,
        phe=resultado.phe,
        benchmark_cetes=Benchmark(
            weights=[float(v) for v in solo_cetes], tev=tev_cetes, phe=phe_cetes
        ),
        frontera=puntos,
        stale=stale,
        as_of=as_of,
    )


@app.post("/risk/simulate", response_model=SimulateResponse)
def risk_simulate(
    payload: SimulateRequest,
    _usuario: Usuario = Depends(usuario_actual),
) -> SimulateResponse:
    market, pasivo, _, _, _, stale, as_of = _entradas_optimizacion(payload.pesos)

    return _respuesta_riesgo(
        market,
        pasivo,
        payload.weights,
        payload.horizonte,
        stale,
        as_of,
    )


def _respuesta_riesgo(
    market,
    pasivo,
    weights: list[float],
    horizonte: int,
    stale: bool,
    as_of: str,
) -> SimulateResponse:

    if len(weights) != len(TICKERS):
        raise HTTPException(
            status_code=422,
            detail=f"Se esperaban {len(TICKERS)} pesos de cartera.",
        )

    w = np.asarray(weights, dtype=float)
    retornos_cartera = returns_matrix(market) @ w

    params_cartera = calibrar(list(retornos_cartera))
    params_pasivo = calibrar(pasivo.personal)

    paths_cartera = simular(params_cartera, horizonte=horizonte, seed=42)
    paths_pasivo = simular(params_pasivo, horizonte=horizonte, seed=43)

    resumen = resumir(paths_cartera, paths_pasivo)
    return SimulateResponse(
        percentiles=resumen.percentiles,
        var_95=resumen.var_95,
        cvar_95=resumen.cvar_95,
        media_final=resumen.media_final,
        stale=stale,
        as_of=as_of,
    )


@app.post("/analysis/run", response_model=RunResponse)
def analysis_run(
    payload: RunRequest,
    _usuario: Usuario = Depends(limitar_analisis),
) -> RunResponse:
    market, pasivo, sigma_a, sigma_al, sigma_l2, stale, as_of = (
        _entradas_optimizacion(payload.pesos)
    )
    optimo = _respuesta_optimizacion(
        sigma_a,
        sigma_al,
        sigma_l2,
        payload.buffer,
        stale,
        as_of,
    )
    return RunResponse(
        inflacion=_respuesta_inflacion(pasivo, stale, as_of),
        optimo=optimo,
        riesgo=_respuesta_riesgo(
            market,
            pasivo,
            optimo.weights,
            payload.horizonte,
            stale,
            as_of,
        ),
    )
