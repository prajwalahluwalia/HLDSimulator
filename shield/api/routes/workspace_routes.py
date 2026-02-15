from __future__ import annotations

from flask import Blueprint, jsonify, request

from services.workspace_service import WorkspaceService

workspace_routes = Blueprint("workspace_routes", __name__)


@workspace_routes.route("/api/workspaces", methods=["GET"])
def list_workspaces():
    user_id = request.args.get("user_id", "local")
    workspaces = WorkspaceService().list_workspaces(user_id)
    payload = [WorkspaceService.serialize(ws) for ws in workspaces]
    return jsonify({"workspaces": payload})


@workspace_routes.route("/api/workspaces", methods=["POST"])
def create_workspace():
    payload = request.get_json(silent=True) or {}
    user_id = payload.get("user_id", "local")
    workspace_type = payload.get("type", "PRACTICE")
    name = payload.get("name", "Untitled Workspace")
    preset_id = payload.get("preset_id")
    graph_json = payload.get("graph_json")
    metadata_json = payload.get("metadata_json")

    workspace = WorkspaceService().create_workspace(
        user_id=user_id,
        workspace_type=workspace_type,
        name=name,
        preset_id=preset_id,
        graph_json=graph_json,
        metadata_json=metadata_json,
    )
    return jsonify(WorkspaceService.serialize(workspace)), 201


@workspace_routes.route("/api/workspaces/<workspace_id>", methods=["GET"])
def get_workspace(workspace_id: str):
    workspace = WorkspaceService().get_workspace(workspace_id)
    if not workspace:
        return jsonify({"error": "Workspace not found."}), 404
    return jsonify(WorkspaceService.serialize(workspace))


@workspace_routes.route("/api/workspaces/<workspace_id>", methods=["PATCH"])
def update_workspace(workspace_id: str):
    payload = request.get_json(silent=True) or {}
    service = WorkspaceService()
    workspace = None
    if "name" in payload:
        workspace = service.rename_workspace(workspace_id, payload.get("name"))
    if "graph_json" in payload:
        workspace = service.update_graph(workspace_id, payload.get("graph_json"))

    if not workspace:
        return jsonify({"error": "Workspace not found."}), 404
    return jsonify(WorkspaceService.serialize(workspace))


@workspace_routes.route("/api/workspaces/<workspace_id>/duplicate", methods=["POST"])
def duplicate_workspace(workspace_id: str):
    payload = request.get_json(silent=True) or {}
    workspace = WorkspaceService().duplicate_workspace(workspace_id, payload.get("name"))
    if not workspace:
        return jsonify({"error": "Workspace not found."}), 404
    return jsonify(WorkspaceService.serialize(workspace)), 201


@workspace_routes.route("/api/workspaces/<workspace_id>", methods=["DELETE"])
def delete_workspace(workspace_id: str):
    if not WorkspaceService().delete_workspace(workspace_id):
        return jsonify({"error": "Workspace not found."}), 404
    return jsonify({"status": "deleted"})
