from __future__ import annotations

import math
from collections import defaultdict, deque
from functools import lru_cache
from threading import Lock
from time import monotonic

import jwt
from fastapi import Depends, HTTPException, Request
from jwt import PyJWKClient

from app.config import settings

# Algoritmos aceptados. La lista es explícita a propósito: dejar que la
# cabecera del token elija libremente es la puerta a la confusión de
# algoritmos. Cada rama usa su propia fuente de clave y nunca se cruzan.
ASIMETRICOS = ("ES256", "RS256")
SIMETRICOS = ("HS256",)


class Usuario:
    def __init__(self, id: str, email: str | None) -> None:
        self.id = id
        self.email = email


@lru_cache(maxsize=1)
def _cliente_jwks() -> PyJWKClient:
    base = (settings.supabase_url or "").rstrip("/")
    return PyJWKClient(f"{base}/auth/v1/.well-known/jwks.json")


def _clave_y_algoritmo(token: str) -> tuple[object, list[str]]:
    """Elige la clave según cómo venga firmado el token.

    Los proyectos nuevos de Supabase firman con ES256, una clave asimétrica
    cuya parte pública se publica en el JWKS del proyecto. El "JWT Secret"
    heredado solo sirve para los proyectos que aún firman con HS256, así que
    hay que soportar ambos: mirar el algoritmo declarado y traer la clave que
    le corresponde.
    """
    try:
        algoritmo = jwt.get_unverified_header(token).get("alg", "")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Sesión inválida.") from exc

    if algoritmo in SIMETRICOS:
        if not settings.supabase_jwt_secret:
            raise HTTPException(
                status_code=503,
                detail="La autenticación del motor no está configurada.",
            )
        return settings.supabase_jwt_secret, list(SIMETRICOS)

    if algoritmo in ASIMETRICOS:
        if not settings.supabase_url:
            raise HTTPException(
                status_code=503,
                detail="La autenticación del motor no está configurada.",
            )
        try:
            return _cliente_jwks().get_signing_key_from_jwt(token).key, [algoritmo]
        except jwt.PyJWKClientError as exc:
            # No pudimos traer la clave pública: es un fallo nuestro de
            # infraestructura, no una sesión inválida del usuario.
            raise HTTPException(
                status_code=503,
                detail="No pudimos verificar tu sesión. Intenta en un minuto.",
            ) from exc

    raise HTTPException(status_code=401, detail="Sesión inválida.")


def usuario_actual(request: Request) -> Usuario:
    encabezado = request.headers.get("authorization", "")
    if not encabezado.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401,
            detail="Falta tu sesión. Vuelve a iniciar sesión.",
        )

    token = encabezado.split(" ", 1)[1].strip()
    clave, algoritmos = _clave_y_algoritmo(token)

    try:
        claims = jwt.decode(
            token,
            clave,
            algorithms=algoritmos,
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=401,
            detail="Tu sesión expiró. Vuelve a iniciar sesión.",
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Sesión inválida.") from exc

    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Sesión inválida.")
    return Usuario(id=sub, email=claims.get("email"))


def usuario_opcional(request: Request) -> Usuario | None:
    """Permite el acceso a endpoints públicos pero extrae el usuario si viene el token."""
    encabezado = request.headers.get("authorization", "")
    if not encabezado.lower().startswith("bearer "):
        return None
    try:
        token = encabezado.split(" ", 1)[1].strip()
        clave, algoritmos = _clave_y_algoritmo(token)
        claims = jwt.decode(
            token,
            clave,
            algorithms=algoritmos,
            audience="authenticated",
        )
        sub = claims.get("sub")
        if not sub:
            return None
        return Usuario(id=sub, email=claims.get("email"))
    except Exception:
        return None



class LimitadorPorUsuario:
    """Ventana móvil en memoria para proteger cálculos costosos."""

    def __init__(self, limite: int, ventana_segundos: float) -> None:
        self.limite = limite
        self.ventana_segundos = ventana_segundos
        self._intentos: dict[str, deque[float]] = defaultdict(deque)
        self._candado = Lock()

    def __call__(
        self,
        usuario: Usuario = Depends(usuario_actual),
    ) -> Usuario:
        ahora = monotonic()
        with self._candado:
            intentos = self._intentos[usuario.id]
            inicio = ahora - self.ventana_segundos
            while intentos and intentos[0] <= inicio:
                intentos.popleft()

            if len(intentos) >= self.limite:
                espera = max(1, math.ceil(self.ventana_segundos - (ahora - intentos[0])))
                raise HTTPException(
                    status_code=429,
                    detail="Has realizado demasiados análisis. Intenta de nuevo en un minuto.",
                    headers={"Retry-After": str(espera)},
                )

            intentos.append(ahora)
        return usuario

    def reiniciar(self) -> None:
        with self._candado:
            self._intentos.clear()


limitar_analisis = LimitadorPorUsuario(limite=30, ventana_segundos=60.0)
