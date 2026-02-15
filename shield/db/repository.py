from __future__ import annotations

from typing import Iterable

from db.models import Workspace
from db.session import session_scope


class WorkspaceRepository:
    def create(self, workspace: Workspace) -> Workspace:
        with session_scope() as session:
            session.add(workspace)
            session.flush()
            session.refresh(workspace)
            return workspace

    def get(self, workspace_id) -> Workspace | None:
        with session_scope() as session:
            return session.get(Workspace, workspace_id)

    def list_by_user(self, user_id: str) -> Iterable[Workspace]:
        with session_scope() as session:
            return list(session.query(Workspace).filter(Workspace.user_id == user_id).all())

    def update(self, workspace: Workspace) -> Workspace:
        with session_scope() as session:
            merged = session.merge(workspace)
            session.flush()
            session.refresh(merged)
            return merged

    def delete(self, workspace_id) -> bool:
        with session_scope() as session:
            workspace = session.get(Workspace, workspace_id)
            if not workspace:
                return False
            session.delete(workspace)
            return True
