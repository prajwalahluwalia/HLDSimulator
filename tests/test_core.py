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


def test_validate_graph_fanout():
    graph = {
        "nodes": [
            {"id": "user", "type": "User", "config": {"number_of_users": 10, "requests_per_user": 2}},
            {"id": "lb", "type": "LoadBalancer", "config": {"capacity": 200, "base_latency": 10}},
            {"id": "server-1", "type": "Server", "config": {"capacity": 50, "base_latency": 20}},
            {"id": "server-2", "type": "Server", "config": {"capacity": 50, "base_latency": 20}},
            {"id": "db", "type": "Database", "config": {"capacity": 80, "base_latency": 40}},
        ],
        "edges": [
            {"source": "user", "target": "lb"},
            {"source": "lb", "target": "server-1"},
            {"source": "lb", "target": "server-2"},
            {"source": "server-1", "target": "db"},
            {"source": "server-2", "target": "db"},
        ],
    }

    errors, ordered = validate_graph(graph)
    ordered_ids = [node["id"] for node in ordered]
    assert errors == []
    assert ordered_ids[0] == "user"
    assert ordered_ids[-1] == "db"
    assert set(ordered_ids) == {"user", "lb", "server-1", "server-2", "db"}


def test_validate_graph_multiple_exits():
    graph = {
        "nodes": [
            {"id": "user", "type": "User", "config": {"number_of_users": 10, "requests_per_user": 1}},
            {"id": "lb", "type": "LoadBalancer", "config": {"capacity": 200, "base_latency": 10}},
            {"id": "cache-1", "type": "Cache", "config": {"capacity": 100, "base_latency": 5}},
            {"id": "cache-2", "type": "Cache", "config": {"capacity": 100, "base_latency": 5}},
            {"id": "db-1", "type": "Database", "config": {"capacity": 80, "base_latency": 40}},
            {"id": "db-2", "type": "Database", "config": {"capacity": 80, "base_latency": 40}},
        ],
        "edges": [
            {"source": "user", "target": "lb"},
            {"source": "lb", "target": "cache-1"},
            {"source": "lb", "target": "cache-2"},
            {"source": "cache-1", "target": "db-1"},
            {"source": "cache-2", "target": "db-2"},
        ],
    }

    errors, ordered = validate_graph(graph)
    ordered_ids = [node["id"] for node in ordered]
    assert errors == []
    assert ordered_ids[0] == "user"
    assert set(ordered_ids) == {"user", "lb", "cache-1", "cache-2", "db-1", "db-2"}


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
        "edges": [
            {"source": "user", "target": "server"},
            {"source": "server", "target": "db"},
        ],
    }

    performance, metrics = simulate(graph)
    assert performance["incoming_rps"] == 20
    assert performance["throughput"] == 30
    assert performance["total_latency"] == 60
    assert performance["error_rate"] == 0
    assert metrics[0]["status"] == "healthy"


def test_simulate_fanout():
    graph = {
        "nodes": [
            {"id": "user", "type": "User", "config": {"number_of_users": 100, "requests_per_user": 1}},
            {"id": "lb", "type": "LoadBalancer", "config": {"capacity": 300, "base_latency": 10}},
            {"id": "server-1", "type": "Server", "config": {"capacity": 50, "base_latency": 20}},
            {"id": "server-2", "type": "Server", "config": {"capacity": 50, "base_latency": 20}},
            {"id": "db", "type": "Database", "config": {"capacity": 80, "base_latency": 40}},
        ],
        "edges": [
            {"source": "user", "target": "lb"},
            {"source": "lb", "target": "server-1"},
            {"source": "lb", "target": "server-2"},
            {"source": "server-1", "target": "db"},
            {"source": "server-2", "target": "db"},
        ],
    }

    performance, metrics = simulate(graph)
    assert performance["incoming_rps"] == 100
    assert performance["throughput"] == 80
    assert performance["total_latency"] == 92.5
    assert performance["error_rate"] == 0.2
    assert any(metric["status"] == "overloaded" for metric in metrics)


def test_simulate_weighted_distribution():
    graph = {
        "nodes": [
            {"id": "user", "type": "User", "config": {"number_of_users": 505000, "requests_per_user": 1}},
            {"id": "lb", "type": "LoadBalancer", "config": {"capacity": 600000, "base_latency": 5}},
            {"id": "server-1", "type": "Server", "config": {"capacity": 500000, "base_latency": 10}},
            {"id": "server-2", "type": "Server", "config": {"capacity": 5000, "base_latency": 10}},
            {"id": "db", "type": "Database", "config": {"capacity": 505000, "base_latency": 20}},
        ],
        "edges": [
            {"source": "user", "target": "lb"},
            {"source": "lb", "target": "server-1"},
            {"source": "lb", "target": "server-2"},
            {"source": "server-1", "target": "db"},
            {"source": "server-2", "target": "db"},
        ],
    }

    performance, metrics = simulate(graph)
    assert performance["incoming_rps"] == 505000
    assert performance["throughput"] == 505000
    assert performance["total_latency"] == 35
    assert performance["error_rate"] == 0
    assert any(metric["component_type"] == "Server" for metric in metrics)
