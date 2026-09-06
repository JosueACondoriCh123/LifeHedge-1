from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

log = logging.getLogger(__name__)


class NoDataAvailable(RuntimeError):
    """No hay dato fresco, ni caché, ni snapshot para esta clave."""


@dataclass(frozen=True)
class Cached:
    payload: dict[str, Any]
    stale: bool
    as_of: str


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _age_seconds(as_of: str) -> float:
    stamped = datetime.fromisoformat(as_of)
    if stamped.tzinfo is None:
        stamped = stamped.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - stamped).total_seconds()


class DiskCache:
    def __init__(self, cache_dir: Path, snapshot_dir: Path) -> None:
        self._cache_dir = cache_dir
        self._snapshot_dir = snapshot_dir
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    def get_or_fetch(
        self,
        key: str,
        ttl_seconds: int,
        fetch: Callable[[], dict[str, Any]],
    ) -> Cached:
        cached = self._read(self._cache_dir / f"{key}.json")

        if cached is not None and _age_seconds(cached["as_of"]) < ttl_seconds:
            return Cached(payload=cached["payload"], stale=False, as_of=cached["as_of"])

        try:
            payload = fetch()
        except Exception:
            log.warning("fetch falló para '%s'; buscando respaldo", key, exc_info=True)
        else:
            as_of = _now_iso()
            self._write(self._cache_dir / f"{key}.json", payload, as_of)
            return Cached(payload=payload, stale=False, as_of=as_of)

        if cached is not None:
            return Cached(payload=cached["payload"], stale=True, as_of=cached["as_of"])

        snapshot = self._read(self._snapshot_dir / f"{key}.json")
        if snapshot is not None:
            return Cached(
                payload=snapshot["payload"], stale=True, as_of=snapshot["as_of"]
            )

        raise NoDataAvailable(f"sin datos disponibles para '{key}'")

    @staticmethod
    def _read(path: Path) -> dict[str, Any] | None:
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            log.warning("archivo ilegible: %s", path, exc_info=True)
            return None

    @staticmethod
    def _write(path: Path, payload: dict[str, Any], as_of: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps({"payload": payload, "as_of": as_of}, ensure_ascii=False),
            encoding="utf-8",
        )
