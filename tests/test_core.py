from shield.core.graph_validator import validate_graph
from shield.core.simulation_engine import simulate


def test_validate_graph_linear():
    graph = {
        "nodes": [
            {"id": "user", "type": "User", "config": {"number_of_users": 10, "requests_per_user": 2}},
            {"id": "server", "type": "Server", "config": {"capacity": 50, "base_latency": 20}},
            {"id": "db", "type": "Database", "config": {"capacity": 30, "base_latency": 40}},
        ],
        "edges": [
            {"source": "user", "target": "server"},
            {"source": "server", "target": "db"},
        ],
    }

    errors, ordered = validate_graph(graph)
    assert errors == []
    assert [node["id"] for node in ordered] == ["user", "server", "db"]


def test_validate_graph_cycle():
    graph = {
        "nodes": [
            {"id": "user", "type": "User", "config": {"number_of_users": 10, "requests_per_user": 2}},
            {"id": "server", "type": "Server", "config": {"capacity": 50, "base_latency": 20}},
        ],
        "edges": [
            {"source": "user", "target": "server"},
            {"source": "server", "target": "user"},
        ],
    }

    errors, ordered = validate_graph(graph)
    assert "Graph must not contain cycles." in errors
    assert ordered == []


def test_simulate_basic():
    graph = {
        "nodes": [
            {"id": "user", "type": "User", "config": {"number_of_users": 10, "requests_per_user": 2}},
            {"id": "server", "type": "Server", "config": {"capacity": 50, "base_latency": 20}},
            {"id": "db", "type": "Database", "config": {"capacity": 30, "base_latency": 40}},
        ],
        "edges": [],
    }

    performance, metrics = simulate(graph)
    assert performance["incoming_rps"] == 20
    assert performance["throughput"] == 30
    assert performance["total_latency"] == 60
    assert performance["error_rate"] == 0
    assert metrics[0]["status"] == "healthy"
