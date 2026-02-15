from __future__ import annotations

from typing import Dict, List

from core.architecture_review import review_architecture
from core.graph.validator import validate_graph as validate_structural_graph
from core.graph_validator import validate_graph
from core.recommendation_engine import generate_recommendations
from core.simulation_engine import simulate


class SimulationService:
    def validate_graph(self, payload: Dict[str, object]) -> Dict[str, object]:
        graph = payload.get("graph", {}) if isinstance(payload, dict) else {}
        return validate_structural_graph(graph)

    def run_simulation(self, payload: Dict[str, object]) -> Dict[str, object]:
        graph = payload.get("graph", {}) if isinstance(payload, dict) else {}
        traffic_profile = payload.get("traffic_profile")
        environment_config = payload.get("environment_config")
        mode = payload.get("mode", "sandbox")

        structural_errors, ordered_nodes = validate_graph(graph)
        response = {
            "structural_errors": structural_errors,
            "architectural_warnings": [],
            "performance": {},
            "node_metrics": [],
            "recommendations": [],
        }

        if structural_errors:
            return response

        warnings = review_architecture(ordered_nodes)
        performance, node_metrics = simulate(
            graph=graph,
            traffic_profile=traffic_profile,
            environment_config=environment_config,
            mode=mode,
            ordered_nodes=ordered_nodes,
        )
        recommendations = generate_recommendations(
            performance=performance, node_metrics=node_metrics, warnings=warnings
        )

        response.update(
            {
                "architectural_warnings": warnings,
                "performance": performance,
                "node_metrics": node_metrics,
                "recommendations": recommendations,
            }
        )
        return response
