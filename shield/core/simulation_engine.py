from collections import defaultdict
from typing import Dict, List, Optional, Tuple


Node = Dict[str, object]
Graph = Dict[str, object]


def _extract_user_profile(ordered_nodes: List[Node]) -> Dict[str, float]:
    for node in ordered_nodes:
        if node.get("type") == "User":
            config = node.get("config", {}) or {}
            return {
                "number_of_users": float(config.get("number_of_users", 0)),
                "requests_per_user": float(config.get("requests_per_user", 0)),
            }
    return {"number_of_users": 0.0, "requests_per_user": 0.0}


def simulate(
    graph: Graph,
    traffic_profile: Optional[Dict[str, float]] = None,
    environment_config: Optional[Dict[str, object]] = None,
    mode: str = "sandbox",
    ordered_nodes: Optional[List[Node]] = None,
) -> Tuple[Dict[str, object], List[Dict[str, object]]]:
    nodes = ordered_nodes or graph.get("nodes", []) or []
    node_map = {node.get("id"): node for node in nodes if node.get("id")}
    edges = graph.get("edges", []) or []

    adjacency = defaultdict(list)
    indegree = defaultdict(int)
    outdegree = defaultdict(int)

    for edge in edges:
        source = edge.get("source")
        target = edge.get("target")
        if source not in node_map or target not in node_map:
            continue
        if source == target:
            continue
        adjacency[source].append(target)
        indegree[target] += 1
        outdegree[source] += 1

    for node_id in node_map:
        indegree.setdefault(node_id, 0)
        outdegree.setdefault(node_id, 0)

    if not nodes:
        return {"incoming_rps": 0, "throughput": 0, "total_latency": 0, "error_rate": 0, "bottleneck_component": ""}, []

    if ordered_nodes:
        ordered_ids = [node.get("id") for node in ordered_nodes if node.get("id")]
    else:
        entry_nodes = [node_id for node_id, deg in indegree.items() if deg == 0]
        queue = entry_nodes[:1]
        ordered_ids = []
        indegree_work = dict(indegree)
        while queue:
            node_id = queue.pop(0)
            ordered_ids.append(node_id)
            for neighbor in adjacency.get(node_id, []):
                indegree_work[neighbor] -= 1
                if indegree_work[neighbor] == 0:
                    queue.append(neighbor)

    ordered_nodes = [node_map[node_id] for node_id in ordered_ids if node_id in node_map]
    if traffic_profile is None:
        traffic_profile = _extract_user_profile(ordered_nodes)

    number_of_users = float(traffic_profile.get("number_of_users", 0))
    requests_per_user = float(traffic_profile.get("requests_per_user", 0))
    incoming_rps = number_of_users * requests_per_user

    incoming_rps_map = {node_id: 0.0 for node_id in node_map}
    entry_candidates = [node_id for node_id, deg in indegree.items() if deg == 0]
    entry_node_id = entry_candidates[0] if entry_candidates else ordered_ids[0]
    incoming_rps_map[entry_node_id] = incoming_rps

    levels: Dict[str, int] = {entry_node_id: 0}

    for node_id in ordered_ids:
        node_rps = incoming_rps_map.get(node_id, 0.0)
        targets = adjacency.get(node_id, [])
        if targets:
            share = node_rps / len(targets) if node_rps > 0 else 0.0
            for target in targets:
                incoming_rps_map[target] = incoming_rps_map.get(target, 0.0) + share
                levels[target] = max(levels.get(target, 0), levels.get(node_id, 0) + 1)

    component_nodes = [node for node in ordered_nodes if node.get("type") != "User"]
    node_metrics: List[Dict[str, object]] = []

    total_latency = 0.0
    throughput_candidates: List[float] = []
    max_utilization = -1.0
    bottleneck_component = ""
    max_error_rate = 0.0

    level_latencies: Dict[int, List[Tuple[float, float]]] = defaultdict(list)
    level_capacities: Dict[int, float] = defaultdict(float)

    for node in component_nodes:
        config = node.get("config", {}) or {}
        capacity = float(config.get("capacity", 0))
        base_latency = float(config.get("base_latency", 0))
        component_type = node.get("type", "Unknown")
        node_id = node.get("id")
        node_rps = incoming_rps_map.get(node_id, 0.0)

        if capacity > 0:
            utilization = node_rps / capacity if capacity else float("inf")
        else:
            utilization = float("inf")

        if utilization <= 1:
            effective_latency = base_latency
            error_rate = 0.0
            status = "healthy"
        else:
            overflow_ratio = utilization
            effective_latency = base_latency * (overflow_ratio**2)
            error_rate = (
                (node_rps - capacity) / node_rps if node_rps > 0 else 0.0
            )
            status = "overloaded"

        node_level = levels.get(node_id, 0)
        if node_rps > 0:
            level_latencies[node_level].append((effective_latency, node_rps))
        if capacity > 0:
            level_capacities[node_level] += capacity

        if utilization > max_utilization:
            max_utilization = utilization
            bottleneck_component = component_type

        max_error_rate = max(max_error_rate, error_rate)

        node_metrics.append(
            {
                "component_type": component_type,
                "utilization": round(utilization, 3) if utilization != float("inf") else None,
                "latency_contribution": round(effective_latency, 3),
                "status": status,
            }
        )

    for level, values in level_latencies.items():
        if level == 0:
            continue
        total_level_rps = sum(weight for _, weight in values)
        if total_level_rps > 0:
            total_latency += sum(latency * (weight / total_level_rps) for latency, weight in values)

    if level_capacities:
        throughput_candidates = [cap for level, cap in level_capacities.items() if level != 0]
    throughput = min(throughput_candidates) if throughput_candidates else 0.0

    performance = {
        "incoming_rps": int(incoming_rps),
        "throughput": int(throughput),
        "total_latency": round(total_latency, 3),
        "error_rate": round(max_error_rate, 3),
        "bottleneck_component": bottleneck_component,
    }

    return performance, node_metrics
