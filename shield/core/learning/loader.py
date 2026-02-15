from __future__ import annotations

import json
from pathlib import Path
from typing import Dict

from .models import SystemDesign


class PresetLoadError(RuntimeError):
    pass


def load_preset(path: Path) -> SystemDesign:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise PresetLoadError(f"Unable to load preset: {path.name}") from exc

    if not isinstance(data, dict):
        raise PresetLoadError(f"Preset {path.name} must contain a JSON object.")

    if "id" not in data:
        data = dict(data)
        data["id"] = path.stem

    try:
        return SystemDesign.from_dict(data)
    except ValueError as exc:
        raise PresetLoadError(f"Preset {path.name} is invalid: {exc}") from exc


def load_raw(path: Path) -> Dict[str, object]:
    return load_preset(path).to_dict()
