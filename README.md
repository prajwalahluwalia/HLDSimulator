# SHIELD — System High-level Interactive Engine for Learning & Design

SHIELD is a lightweight system design sandbox for building linear request flows, simulating performance, and receiving architectural feedback.

## Features (MVP)
- Drag-and-drop user, server, and database nodes onto a canvas.
- Connect nodes in a directed flow.
- Configure component capacity and latency.
- Simulate throughput, latency, error rate, bottlenecks, and recommendations.

## Quick start
1. Create a virtual environment and install dependencies.
2. Run the Flask app.

The app is located in `shield/app.py` and can be started as a module.

## Development notes
- Core logic lives in `shield/core` and is testable independently of Flask.
- Graph validation enforces a single-entry, single-exit, linear path with no cycles.

## Project structure
```
shield/
  app.py
  core/
    graph_validator.py
    simulation_engine.py
    architecture_review.py
    recommendation_engine.py
  templates/
    index.html
  static/
    js/
    css/
```
