from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List

from .loader import load_preset
from .models import SystemDesign


@dataclass
class DesignRegistry:
    presets_dir: Path
    _cache: Dict[str, SystemDesign] = field(default_factory=dict, init=False)
    allowed_ids: List[str] = field(
        default_factory=lambda: [
            "booking_system",
            "url_shortener",
            "ride_sharing",
            "library_management",
            "payment_fraud",
            "rate_limiter",
            "messaging_app",
            "news_feed",
            "ecommerce_checkout",
            "video_streaming",
        ]
    )

    def list_designs(self) -> List[SystemDesign]:
        return [self._load(path) for path in self._preset_paths()]

    def get_design(self, design_id: str) -> SystemDesign:
        path = self._resolve_path(design_id)
        return self._load(path)

    def _preset_paths(self) -> Iterable[Path]:
        if not self.presets_dir.exists():
            return []
        paths = [path for path in self.presets_dir.glob("*.json") if path.stem in self.allowed_ids]
        return sorted(paths)

    def _resolve_path(self, design_id: str) -> Path:
        if design_id not in self.allowed_ids:
            raise FileNotFoundError(f"Preset {design_id} not found.")
        path = self.presets_dir / f"{design_id}.json"
        if not path.exists():
            raise FileNotFoundError(f"Preset {design_id} not found.")
        return path

    def _load(self, path: Path) -> SystemDesign:
        design_id = path.stem
        if design_id not in self._cache:
            self._cache[design_id] = load_preset(path)
        return self._cache[design_id]
