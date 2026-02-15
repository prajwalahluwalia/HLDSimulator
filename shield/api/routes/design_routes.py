from __future__ import annotations

from flask import Blueprint, jsonify

from services.design_service import DesignService

design_routes = Blueprint("design_routes", __name__)


@design_routes.route("/api/presets", methods=["GET"])
def list_presets():
    presets = DesignService().list_presets()
    return jsonify({"presets": presets})


@design_routes.route("/api/presets/<name>")
def get_preset(name: str):
    payload, status = DesignService().get_preset(name)
    return jsonify(payload), status
