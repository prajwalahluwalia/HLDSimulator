from __future__ import annotations

import uuid
from typing import Dict, Iterable, Tuple

from db.models import Workspace, WorkspaceType
from db.repository import WorkspaceRepository


class WorkspaceService:
    def __init__(self) -> None:
        self._repo = WorkspaceRepository()

    def create_workspace(
        self,
        user_id: str,
        workspace_type: str,
        name: str,
        preset_id: str | None = None,
        graph_json: Dict[str, object] | None = None,
        metadata_json: Dict[str, object] | None = None,
    ) -> Workspace:
        workspace = Workspace(
            user_id=user_id,
            type=WorkspaceType(workspace_type),
            name=name,
            preset_id=preset_id,
            graph_json=graph_json or {},
            metadata_json=metadata_json or {},
        )
        return self._repo.create(workspace)

    def get_workspace(self, workspace_id: str) -> Workspace | None:
        return self._repo.get(uuid.UUID(workspace_id))

    def list_workspaces(self, user_id: str) -> Iterable[Workspace]:
        return self._repo.list_by_user(user_id)

    def update_graph(self, workspace_id: str, graph_json: Dict[str, object]) -> Workspace | None:
        workspace = self.get_workspace(workspace_id)
        if not workspace:
            return None
        workspace.graph_json = graph_json
        return self._repo.update(workspace)

    def rename_workspace(self, workspace_id: str, new_name: str) -> Workspace | None:
        workspace = self.get_workspace(workspace_id)
        if not workspace:
            return None
        workspace.name = new_name
        return self._repo.update(workspace)

    def duplicate_workspace(self, workspace_id: str, new_name: str | None = None) -> Workspace | None:
        workspace = self.get_workspace(workspace_id)
        if not workspace:
            return None
        clone = Workspace(
            user_id=workspace.user_id,
            type=workspace.type,
            name=new_name or f"{workspace.name} (copy)",
            preset_id=workspace.preset_id,
            graph_json=workspace.graph_json,
            metadata_json=workspace.metadata_json,
        )
        return self._repo.create(clone)

    def delete_workspace(self, workspace_id: str) -> bool:
        return self._repo.delete(uuid.UUID(workspace_id))

    @staticmethod
    def serialize(workspace: Workspace) -> Dict[str, object]:
        return {
            "id": str(workspace.id),
            "user_id": workspace.user_id,
            "name": workspace.name,
            "type": workspace.type.value,
            "preset_id": workspace.preset_id,
            "graph_json": workspace.graph_json,
            "metadata_json": workspace.metadata_json,
            "created_at": workspace.created_at.isoformat() if workspace.created_at else None,
            "updated_at": workspace.updated_at.isoformat() if workspace.updated_at else None,
        }
