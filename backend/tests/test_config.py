from app.config import Settings


def test_cors_acepta_una_lista_separada_por_comas():
    config = Settings(
        _env_file=None,
        cors_origins_raw=(
            "http://localhost:5173, https://lifehedge.example,  "
        ),
    )

    assert config.cors_origins == [
        "http://localhost:5173",
        "https://lifehedge.example",
    ]
