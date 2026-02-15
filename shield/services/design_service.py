from __future__ import annotations

from typing import Dict, Tuple

from api.schemas import PRESET_ID_PATTERN
from core.learning import engine as learning_engine


class DesignService:
    def list_presets(self):
        return learning_engine.get_available_designs()

    def get_preset(self, name: str) -> Tuple[Dict[str, object], int]:
        if not PRESET_ID_PATTERN.fullmatch(name or ""):
            return {"error": "Invalid preset name."}, 400
        try:
            preset = learning_engine.load_design(name)
        except FileNotFoundError:
            return {"error": "Preset not found."}, 404
        except Exception:
            return {"error": "Preset could not be loaded."}, 500
        return preset, 200
