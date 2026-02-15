from __future__ import annotations

from flask import Blueprint, jsonify, request

from services.learning_service import LearningService

learning_routes = Blueprint("learning_routes", __name__)


@learning_routes.route("/api/design/<design_id>/faqs", methods=["GET"])
def design_faqs(design_id: str):
    query = {
        "stage": request.args.get("stage"),
        "topic": request.args.get("topic"),
        "difficulty": request.args.get("difficulty"),
        "search": request.args.get("search"),
    }
    payload, status = LearningService().get_faqs(design_id, query)
    return jsonify(payload), status
