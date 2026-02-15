from __future__ import annotations

import enum
import uuid

from sqlalchemy import DateTime, Enum, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class WorkspaceType(str, enum.Enum):
    PRACTICE = "PRACTICE"
    LEARN = "LEARN"
    EVALUATION = "EVALUATION"
    STRESS = "STRESS"


class Base(DeclarativeBase):
    pass


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[WorkspaceType] = mapped_column(Enum(WorkspaceType), nullable=False)
    preset_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    graph_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
