"""Siembra el caché local con series sintéticas para desarrollo.

Correr con: python -m scripts.seed_dev_cache

Sirve para levantar el backend y trabajar contra él sin tokens de INEGI ni
Banxico. Escribe en `data/cache/`, que está en .gitignore, así que nunca se
commitea ni se confunde con los snapshots reales de `data/snapshot/`.

Las respuestas quedan marcadas `stale: false` porque el caché se considera
fresco; para ver el badge de datos guardados en el frontend, borra
`data/cache/` y deja que caiga al snapshot.

IMPORTANTE: estos datos son inventados. Sirven para desarrollar la interfaz,
nunca para una demo ni para una captura de pantalla que alguien pueda leer
como cifras reales de mercado.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "tests"))

from app.config import settings  # noqa: E402
from conftest import _series_sinteticas  # noqa: E402


def main() -> int:
    market, inpc = _series_sinteticas()
    ahora = datetime.now(timezone.utc).isoformat(timespec="seconds")

    settings.cache_dir.mkdir(parents=True, exist_ok=True)
    for clave, payload in (("market", market), ("inpc", inpc)):
        destino = settings.cache_dir / f"{clave}.json"
        destino.write_text(
            json.dumps({"payload": payload, "as_of": ahora}, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"escrito {destino}")

    print("\nDatos SINTETICOS listos. Levanta el backend con:")
    print("  python -m uvicorn app.main:app --reload --port 8000")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
