from __future__ import annotations

from pathlib import Path
from typing import Dict, Tuple

from core.learning.faq_engine import FAQEngine
from core.learning.registry import DesignRegistry


class LearningService:
    def __init__(self) -> None:
        presets_dir = Path(__file__).resolve().parents[1] / "presets"
        self._faq_engine = FAQEngine(DesignRegistry(presets_dir))

    def get_faqs(self, design_id: str, query: Dict[str, str | None]) -> Tuple[Dict[str, object], int]:
        stage = query.get("stage")
        topic = query.get("topic")
        difficulty = query.get("difficulty")
        search = query.get("search")

        try:
            stage_number = int(stage) if stage else None
            if stage_number is not None:
                faqs = self._faq_engine.get_faqs_by_stage(design_id, stage_number)
            else:
                faqs = self._faq_engine.get_all_faqs(design_id)

            if search:
                faqs = self._faq_engine.search_questions(design_id, search)
                if stage_number is not None:
                    faqs = [faq for faq in faqs if faq.get("stage") in (None, stage_number)]

            if topic:
                topic_key = topic.lower()
                faqs = [faq for faq in faqs if topic_key in {t.lower() for t in faq.get("topics", [])}]
            if difficulty:
                faqs = [faq for faq in faqs if faq.get("difficulty") == difficulty]

            return {"faqs": faqs}, 200
        except FileNotFoundError:
            return {"error": "Preset not found."}, 404
        except Exception:
            return {"error": "FAQs could not be loaded."}, 500
