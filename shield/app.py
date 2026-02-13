from __future__ import annotations

import sys
from pathlib import Path

from flask import Flask, jsonify, render_template, request

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parent))
    from core.architecture_review import review_architecture
    from core.graph_validator import validate_graph
    from core.recommendation_engine import generate_recommendations
    from core.simulation_engine import simulate
else:
    from .core.architecture_review import review_architecture
    from .core.graph_validator import validate_graph
    from .core.recommendation_engine import generate_recommendations
    from .core.simulation_engine import simulate

app = Flask(__name__, template_folder="templates", static_folder="static")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/simulate", methods=["POST"])
def simulate_route():
    payload = request.get_json(silent=True) or {}
    graph = payload.get("graph", {})
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
        return jsonify(response)

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
    return jsonify(response)


if __name__ == "__main__":
    app.run(debug=True)
