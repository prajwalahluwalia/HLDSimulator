from __future__ import annotations

import sys
from pathlib import Path

from flask import Flask, render_template

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parent))
    from api import register_routes
    from config import Config
    from db.session import init_db
else:
    from .api import register_routes
    from .config import Config
    from .db.session import init_db


def create_app() -> Flask:
    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.config.from_object(Config)

    register_routes(app)
    init_db()

    @app.route("/")
    def index():
        return render_template("index.html")

    return app


if __name__ == "__main__":
    create_app().run(debug=True)
