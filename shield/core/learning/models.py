from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence


Graph = Dict[str, object]


@dataclass(frozen=True)
class FAQ:
    id: str
    question: str
    answer: str
    difficulty: str
    topics: List[str]
    stage: Optional[int]
    related_components: List[str]
    follow_up_questions: List[str]
    expanded_explanation: Optional[str] = None
    ai_followup_prompt: str = "Explain this concept with a real-world example."

    @classmethod
    def from_dict(cls, data: Dict[str, object]) -> "FAQ":
        faq_id = str(data.get("id", "")).strip()
        question = str(data.get("question", "")).strip()
        answer = str(data.get("answer", "")).strip()
        difficulty = str(data.get("difficulty", "")).strip()
        topics = [str(topic) for topic in data.get("topics", []) or []]
        stage_value = data.get("stage")
        stage = int(stage_value) if stage_value is not None else None
        related_components = [str(item) for item in data.get("related_components", []) or []]
        follow_ups = [str(item) for item in data.get("follow_up_questions", []) or []]
        expanded = data.get("expanded_explanation")
        ai_prompt = str(data.get("ai_followup_prompt", "")).strip() or "Explain this concept with a real-world example."

        if not faq_id:
            raise ValueError("FAQ entries must include an id.")
        if not question or not answer:
            raise ValueError("FAQ entries must include question and answer.")
        if difficulty not in {"Beginner", "Intermediate", "Advanced"}:
            raise ValueError("FAQ difficulty must be Beginner, Intermediate, or Advanced.")
        if not topics:
            raise ValueError("FAQ topics must be a non-empty list.")

        return cls(
            id=faq_id,
            question=question,
            answer=answer,
            difficulty=difficulty,
            topics=topics,
            stage=stage,
            related_components=related_components,
            follow_up_questions=follow_ups,
            expanded_explanation=expanded,
            ai_followup_prompt=ai_prompt,
        )

    def to_dict(self) -> Dict[str, object]:
        return {
            "id": self.id,
            "question": self.question,
            "answer": self.answer,
            "difficulty": self.difficulty,
            "topics": self.topics,
            "stage": self.stage,
            "related_components": self.related_components,
            "follow_up_questions": self.follow_up_questions,
            "expanded_explanation": self.expanded_explanation,
            "ai_followup_prompt": self.ai_followup_prompt,
        }


@dataclass(frozen=True)
class Stage:
    stage: int
    title: str
    learning_goal: str
    graph: Graph

    @classmethod
    def from_dict(cls, data: Dict[str, object]) -> "Stage":
        if "stage" not in data or "title" not in data or "graph" not in data:
            raise ValueError("Stage must include stage, title, and graph fields.")
        stage_value = int(data.get("stage"))
        title = str(data.get("title", "")).strip()
        learning_goal = str(data.get("learning_goal", "")).strip()
        graph = data.get("graph", {}) or {}
        if not title:
            raise ValueError("Stage title cannot be empty.")
        if not learning_goal:
            raise ValueError("Stage learning_goal cannot be empty.")
        if not isinstance(graph, dict):
            raise ValueError("Stage graph must be an object.")
        return cls(stage=stage_value, title=title, learning_goal=learning_goal, graph=graph)

    def to_dict(self) -> Dict[str, object]:
        return {
            "stage": self.stage,
            "title": self.title,
            "learning_goal": self.learning_goal,
            "graph": self.graph,
        }


@dataclass(frozen=True)
class SystemDesign:
    id: str
    name: str
    description: str
    difficulty: str
    traffic_profile: Dict[str, float]
    stages: List[Stage]
    faqs: List[FAQ]
    stage_faqs: Dict[str, List[FAQ]]
    concepts: List[str]
    metadata: Dict[str, object] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Dict[str, object]) -> "SystemDesign":
        required_fields = ["id", "name", "description", "difficulty", "stages", "faqs", "concepts"]
        missing = [field for field in required_fields if not data.get(field)]
        if missing:
            raise ValueError(f"Design preset missing fields: {', '.join(missing)}")

        design_id = str(data.get("id", "")).strip()
        name = str(data.get("name", "")).strip()
        description = str(data.get("description", "")).strip()
        difficulty = str(data.get("difficulty", "")).strip()

        traffic_profile = data.get("traffic_profile") or data.get("traffic") or {}
        if not isinstance(traffic_profile, dict):
            raise ValueError("traffic_profile must be an object.")
        users = float(traffic_profile.get("users", 0))
        requests_per_user = float(traffic_profile.get("requests_per_user", 0))
        traffic = {"users": users, "requests_per_user": requests_per_user}

        stages_raw = data.get("stages", []) or []
        stages = [Stage.from_dict(stage) for stage in stages_raw]
        if not stages:
            raise ValueError("Design must include at least one stage.")
        stage_numbers = [stage.stage for stage in stages]
        if len(set(stage_numbers)) != len(stage_numbers):
            raise ValueError("Stage numbers must be unique.")

        faqs_raw = data.get("faqs", []) or []
        faqs = [FAQ.from_dict(faq) for faq in faqs_raw]

        stage_faqs_raw = data.get("stage_faqs", {}) or {}
        if not isinstance(stage_faqs_raw, dict):
            raise ValueError("stage_faqs must be an object keyed by stage.")
        stage_faqs = {
            str(stage_key): [FAQ.from_dict(faq) for faq in stage_entries or []]
            for stage_key, stage_entries in stage_faqs_raw.items()
        }

        concepts = [str(concept) for concept in data.get("concepts", []) or []]
        if not concepts:
            raise ValueError("Design must include at least one concept.")

        metadata = {key: value for key, value in data.items() if key not in required_fields and key not in {"traffic_profile", "traffic"}}

        return cls(
            id=design_id,
            name=name,
            description=description,
            difficulty=difficulty,
            traffic_profile=traffic,
            stages=stages,
            faqs=faqs,
            stage_faqs=stage_faqs,
            concepts=concepts,
            metadata=metadata,
        )

    def to_dict(self) -> Dict[str, object]:
        payload = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "difficulty": self.difficulty,
            "traffic_profile": self.traffic_profile,
            "stages": [stage.to_dict() for stage in self.stages],
            "faqs": [faq.to_dict() for faq in self.faqs],
            "stage_faqs": {
                stage: [faq.to_dict() for faq in faqs] for stage, faqs in self.stage_faqs.items()
            },
            "concepts": self.concepts,
        }
        payload.update(self.metadata)
        return payload

    def get_stage(self, stage_number: int) -> Optional[Stage]:
        for stage in self.stages:
            if stage.stage == stage_number:
                return stage
        return None

    def get_full_architecture(self) -> Stage:
        return max(self.stages, key=lambda stage: stage.stage)
