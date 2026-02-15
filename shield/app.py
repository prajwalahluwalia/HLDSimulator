from __future__ import annotations

import sys
from pathlib import Path
import json
import re

from flask import Flask, jsonify, render_template, request

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parent))
    from core.architecture_review import review_architecture
    from core.graph.validator import validate_graph as validate_structural_graph
    from core.graph_validator import validate_graph
    from core.recommendation_engine import generate_recommendations
    from core.simulation_engine import simulate
else:
    from .core.architecture_review import review_architecture
    from .core.graph.validator import validate_graph as validate_structural_graph
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


@app.route("/api/validate", methods=["POST"])
def validate_route():
    payload = request.get_json(silent=True) or {}
    graph = payload.get("graph", {})
    result = validate_structural_graph(graph)
    return jsonify(result)


@app.route("/api/presets", methods=["GET"])
def list_presets():
    presets_dir = Path(__file__).resolve().parent / "presets"
    presets = []
    if presets_dir.exists():
        for preset_path in sorted(presets_dir.glob("*.json")):
            try:
                with preset_path.open("r", encoding="utf-8") as handle:
                    data = json.load(handle)
                presets.append(
                    {
                        "id": preset_path.stem,
                        "name": data.get("name", preset_path.stem),
                        "description": data.get("description", ""),
                    }
                )
            except (OSError, json.JSONDecodeError):
                continue
    return jsonify({"presets": presets})


@app.route("/api/presets/<name>")
def get_preset(name: str):
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", name):
        return jsonify({"error": "Invalid preset name."}), 400

    presets_dir = Path(__file__).resolve().parent / "presets"
    preset_path = presets_dir / f"{name}.json"
    if not preset_path.exists():
        return jsonify({"error": "Preset not found."}), 404

    try:
        with preset_path.open("r", encoding="utf-8") as handle:
            preset = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return jsonify({"error": "Preset could not be loaded."}), 500

    return jsonify(preset)


if __name__ == "__main__":
    app.run(debug=True)
