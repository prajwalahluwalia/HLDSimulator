from __future__ import annotations

from flask import Blueprint, jsonify, request

from services.simulation_service import SimulationService

simulation_routes = Blueprint("simulation_routes", __name__)


@simulation_routes.route("/simulate", methods=["POST"])
def simulate_route():
    payload = request.get_json(silent=True) or {}
    result = SimulationService().run_simulation(payload)
    return jsonify(result)


@simulation_routes.route("/api/validate", methods=["POST"])
def validate_route():
    payload = request.get_json(silent=True) or {}
    result = SimulationService().validate_graph(payload)
    return jsonify(result)
