from __future__ import annotations

from pathlib import Path
from typing import Dict, List

from .models import SystemDesign
from .registry import DesignRegistry


def _default_registry() -> DesignRegistry:
    presets_dir = Path(__file__).resolve().parents[2] / "presets"
    return DesignRegistry(presets_dir=presets_dir)


def get_available_designs() -> List[Dict[str, object]]:
    registry = _default_registry()
    designs = registry.list_designs()
    return [
        {
            "id": design.id,
            "name": design.name,
            "difficulty": design.difficulty,
            "description": design.description,
        }
        for design in designs
    ]


def load_design(design_id: str) -> Dict[str, object]:
    registry = _default_registry()
    design = registry.get_design(design_id)
    return design.to_dict()


def get_stage(design_id: str, stage_number: int) -> Dict[str, object]:
    registry = _default_registry()
    design = registry.get_design(design_id)
    stage = design.get_stage(stage_number)
    if stage is None:
        raise ValueError(f"Stage {stage_number} not found for {design_id}.")
    payload = stage.to_dict()
    payload["traffic_profile"] = design.traffic_profile
    payload["design_id"] = design.id
    return payload


def get_full_architecture(design_id: str) -> Dict[str, object]:
    registry = _default_registry()
    design = registry.get_design(design_id)
    stage = design.get_full_architecture()
    payload = stage.to_dict()
    payload["traffic_profile"] = design.traffic_profile
    payload["design_id"] = design.id
    return payload


def get_faqs(design_id: str) -> List[Dict[str, object]]:
    registry = _default_registry()
    design = registry.get_design(design_id)
    return [faq.to_dict() for faq in design.faqs]
