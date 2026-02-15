from __future__ import annotations

import os


class Config:
    TRUSTED_HOSTS = {"127.0.0.1", "localhost", "0.0.0.0"}
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://prajwalahluwalia:tryCom123@localhost:5432/shield",
    )
