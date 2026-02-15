from __future__ import annotations

from .routes.auth_routes import auth_routes
from .routes.design_routes import design_routes
from .routes.evaluation_routes import evaluation_routes
from .routes.learning_routes import learning_routes
from .routes.simulation_routes import simulation_routes
from .routes.workspace_routes import workspace_routes


def register_routes(app) -> None:
    app.register_blueprint(auth_routes)
    app.register_blueprint(design_routes)
    app.register_blueprint(simulation_routes)
    app.register_blueprint(evaluation_routes)
    app.register_blueprint(learning_routes)
    app.register_blueprint(workspace_routes)
