from __future__ import annotations

import math
from collections import defaultdict, deque
from threading import Lock
from time import monotonic

import jwt
from fastapi import Depends, HTTPException, Request

from app.config import settings


class Usuario:
    def __init__(self, id: str, email: str | None) -> None:
        self.id = id
        self.email = email


def usuario_actual(request: Request) -> Usuario:
    encabezado = request.headers.get("authorization", "")
    if not encabezado.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401,
            detail="Falta tu sesión. Vuelve a iniciar sesión.",
        )

    token = encabezado.split(" ", 1)[1].strip()
    secreto = settings.supabase_jwt_secret
    if not secreto:
        raise HTTPException(
            status_code=503,
            detail="La autenticación del motor no está configurada.",
        )

    try:
        claims = jwt.decode(
            token,
            secreto,
            algorithms=["HS256"],
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
