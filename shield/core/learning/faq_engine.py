from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional

from .models import FAQ, SystemDesign
from .registry import DesignRegistry


@dataclass
class FAQEngine:
    registry: DesignRegistry
    _topic_index: Dict[str, Dict[str, List[str]]] = field(default_factory=dict, init=False)
    _faq_index: Dict[str, Dict[str, FAQ]] = field(default_factory=dict, init=False)

    def get_all_faqs(self, design_id: str) -> List[Dict[str, object]]:
        design = self._load_design(design_id)
        return [faq.to_dict() for faq in design.faqs]

    def get_faqs_by_stage(self, design_id: str, stage_number: int) -> List[Dict[str, object]]:
        design = self._load_design(design_id)
        return [faq.to_dict() for faq in design.faqs]

    def filter_by_topic(self, design_id: str, topic: str) -> List[Dict[str, object]]:
        topic_key = topic.strip().lower()
        self._ensure_index(design_id)
        ids = self._topic_index[design_id].get(topic_key, [])
        return [self._faq_index[design_id][faq_id].to_dict() for faq_id in ids]

    def filter_by_difficulty(self, design_id: str, difficulty: str) -> List[Dict[str, object]]:
        target = difficulty.strip()
        design = self._load_design(design_id)
        return [faq.to_dict() for faq in design.faqs if faq.difficulty == target]

    def search_questions(self, design_id: str, keyword: str) -> List[Dict[str, object]]:
        term = keyword.strip().lower()
        if not term:
            return []
        scored = []
        design = self._load_design(design_id)
        for faq in design.faqs:
            content = " ".join(
                [faq.question, faq.answer, " ".join(faq.topics), " ".join(faq.related_components)]
            ).lower()
            score = content.count(term)
            if score:
                scored.append((score, faq))
        scored.sort(key=lambda item: (-item[0], item[1].id))
        return [faq.to_dict() for _, faq in scored]

    def get_related_faqs(self, design_id: str, faq_id: str) -> List[Dict[str, object]]:
        self._ensure_index(design_id)
        faq = self._faq_index[design_id].get(faq_id)
        if not faq:
            return []
        related = []
        target_topics = set(topic.lower() for topic in faq.topics)
        target_components = set(component.lower() for component in faq.related_components)
        design = self._load_design(design_id)
        for candidate in design.faqs:
            if candidate.id == faq.id:
                continue
            candidate_topics = set(topic.lower() for topic in candidate.topics)
            candidate_components = set(component.lower() for component in candidate.related_components)
            if target_topics & candidate_topics or target_components & candidate_components:
                related.append(candidate)
        return [item.to_dict() for item in related]

    def generate_interview_round(
        self,
        design_id: str,
        difficulty: Optional[str] = None,
        topic: Optional[str] = None,
        limit: int = 5,
    ) -> List[Dict[str, object]]:
        design = self._load_design(design_id)
        faqs = list(design.faqs)
        if difficulty:
            faqs = [faq for faq in faqs if faq.difficulty == difficulty]
        if topic:
            topic_key = topic.strip().lower()
            faqs = [faq for faq in faqs if topic_key in {t.lower() for t in faq.topics}]

        if not faqs:
            return []

        seed = self._seed_for(design_id, difficulty, topic, limit)
        rng = random.Random(seed)
        if len(faqs) <= limit:
            rng.shuffle(faqs)
            return [faq.to_dict() for faq in faqs]
        selected = rng.sample(faqs, limit)
        return [faq.to_dict() for faq in selected]

    def _iter_faqs(self, design_id: str) -> Iterable[FAQ]:
        design = self._load_design(design_id)
        return list(design.faqs)

    def _ensure_index(self, design_id: str) -> None:
        if design_id in self._topic_index:
            return
        self._build_index(design_id)

    def _build_index(self, design_id: str) -> None:
        topic_index: Dict[str, List[str]] = {}
        faq_index: Dict[str, FAQ] = {}
        design = self._load_design(design_id)
        for faq in design.faqs:
            faq_index[faq.id] = faq
            for topic in faq.topics:
                key = topic.lower()
                topic_index.setdefault(key, []).append(faq.id)
        self._topic_index[design_id] = topic_index
        self._faq_index[design_id] = faq_index

    def _load_design(self, design_id: str) -> SystemDesign:
        return self.registry.get_design(design_id)

    @staticmethod
    def _seed_for(
        design_id: str,
        difficulty: Optional[str],
        topic: Optional[str],
        limit: int,
    ) -> int:
        seed_key = f"{design_id}:{difficulty or ''}:{topic or ''}:{limit}"
        digest = hashlib.sha256(seed_key.encode("utf-8")).hexdigest()
        return int(digest[:8], 16)
