import pytest
from fastapi import HTTPException

from app.auth import LimitadorPorUsuario, Usuario


def test_limitador_rechaza_al_superar_el_cupo_por_usuario():
    limitador = LimitadorPorUsuario(limite=2, ventana_segundos=60.0)
    usuario = Usuario(id="usuario-1", email=None)

    assert limitador(usuario) is usuario
    assert limitador(usuario) is usuario
    with pytest.raises(HTTPException) as exc_info:
        limitador(usuario)

    assert exc_info.value.status_code == 429
    assert exc_info.value.headers["Retry-After"] == "60"
