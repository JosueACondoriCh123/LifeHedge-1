"""Baja datos reales una vez y escribe los snapshots de respaldo.

Correr con: python -m scripts.build_snapshot
Los snapshots resultantes se commitean; son la red de seguridad de la demo.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402


def escribir(key: str, payload: dict) -> None:
    destino = settings.snapshot_dir / f"{key}.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(
        json.dumps(
            {
                "payload": payload,
                "as_of": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    print(f"escrito {destino}")


def main() -> int:
    from app.inpc import fetch_inpc_payload
    from app.market_data import fetch_market_payload

    fallos = 0
    for key, fetch in (("market", fetch_market_payload), ("inpc", fetch_inpc_payload)):
        try:
            escribir(key, fetch())
        except Exception as exc:
            print(f"FALLÓ el snapshot de {key}: {exc}", file=sys.stderr)
            fallos += 1
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
