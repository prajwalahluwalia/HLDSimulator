from collections import defaultdict, deque
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
    if not nodes:
        return {
            "incoming_rps": 0,
            "throughput": 0,
            "total_latency": 0,
            "total_error_rate": 0,
            "bottleneck_node_id": None,
            "bottleneck_component": "",
            "bottleneck_components": [],
            "bottleneck_component_ids": [],
        }, []

    node_map = {node.get("id"): node for node in nodes if node.get("id")}
    edges = graph.get("edges", []) or []

    adjacency = defaultdict(list)
    parents = defaultdict(list)
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
        parents[target].append(source)
        indegree[target] += 1
        outdegree[source] += 1

    for node_id in node_map:
        indegree.setdefault(node_id, 0)
        outdegree.setdefault(node_id, 0)

    if ordered_nodes:
        ordered_ids = [node.get("id") for node in ordered_nodes if node.get("id")]
    else:
        queue = deque([node_id for node_id in node_map if indegree[node_id] == 0])
        ordered_ids = []
        indegree_work = dict(indegree)
        while queue:
            node_id = queue.popleft()
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
    root_rps = number_of_users * requests_per_user

    incoming_rps_map = {node_id: 0.0 for node_id in node_map}
    effective_rps_map = {node_id: 0.0 for node_id in node_map}
    node_levels: Dict[str, int] = {}
    node_metrics: List[Dict[str, object]] = []

    entry_nodes = [node_id for node_id, deg in indegree.items() if deg == 0]
    entry_node_id = entry_nodes[0] if entry_nodes else ordered_ids[0]
    incoming_rps_map[entry_node_id] = root_rps

    max_utilization = -1.0
    max_overload_utilization = -1.0
    bottleneck_node_ids: List[str] = []
    bottleneck_components: List[str] = []

    for node_id in ordered_ids:
        node = node_map[node_id]
        node_type = str(node.get("type", "Unknown"))
        node_type_key = node_type.lower().replace("_", "").replace(" ", "")
        is_load_balancer = node_type_key == "loadbalancer"
        config = node.get("config", {}) or {}
        capacity = float(config.get("capacity", 0))
        base_latency = float(config.get("base_latency", 0))

        parent_levels = [node_levels[parent] for parent in parents.get(node_id, []) if parent in node_levels]
        node_levels[node_id] = max(parent_levels, default=-1) + 1

        incoming_rps = incoming_rps_map.get(node_id, 0.0)
        if node_type == "User":
            effective_rps = incoming_rps
            utilization = 0.0
            overflow = 0.0
            latency = 0.0
        else:
            utilization = incoming_rps / capacity if capacity > 0 else (float("inf") if incoming_rps > 0 else 0.0)
            effective_rps = min(incoming_rps, capacity) if capacity > 0 else 0.0
            overflow = max(0.0, incoming_rps - capacity)
            if utilization <= 1:
                latency = base_latency
            else:
                latency = base_latency * (utilization**2)

        effective_rps_map[node_id] = effective_rps

        if node_type != "User":
            if utilization > max_utilization:
                max_utilization = utilization
                bottleneck_node_ids = [node_id]
                bottleneck_components = [node_type]
            elif utilization == max_utilization:
                bottleneck_node_ids.append(node_id)
                bottleneck_components.append(node_type)

            if utilization > 1:
                if utilization > max_overload_utilization:
                    max_overload_utilization = utilization
                    bottleneck_node_ids = [node_id]
                    bottleneck_components = [node_type]
                elif utilization == max_overload_utilization:
                    bottleneck_node_ids.append(node_id)
                    bottleneck_components.append(node_type)

        node_metrics.append(
            {
                "component_id": node_id,
                "component_type": node_type,
                "incoming_rps": round(incoming_rps, 3),
                "effective_rps": round(effective_rps, 3),
                "utilization": round(utilization, 3) if utilization != float("inf") else None,
                "overflow": round(overflow, 3),
                "latency": round(latency, 3),
                "latency_contribution": round(latency, 3),
                "status": "overloaded" if utilization > 1 else "healthy",
            }
        )

        targets = adjacency.get(node_id, [])
        if not targets or effective_rps <= 0:
            continue

        algorithm = str(config.get("algorithm", "round_robin")).lower() if is_load_balancer else "round_robin"
        weights: List[float] = []
        if algorithm == "least_capacity":
            for target in targets:
                target_config = node_map.get(target, {}).get("config", {}) if node_map.get(target) else {}
                weights.append(max(float(target_config.get("capacity", 0)), 0.0))
        elif algorithm == "weighted_round_robin":
            for target in targets:
                target_config = node_map.get(target, {}).get("config", {}) if node_map.get(target) else {}
                weights.append(max(float(target_config.get("weight", 1)), 0.0))
        else:
            weights = [1.0 for _ in targets]

        total_weight = sum(weights)
        for target, weight in zip(targets, weights):
            share = effective_rps / len(targets) if total_weight == 0 else effective_rps * (weight / total_weight)
            incoming_rps_map[target] = incoming_rps_map.get(target, 0.0) + share

    level_latencies: Dict[int, float] = defaultdict(float)
    for metric in node_metrics:
        node_id = metric["component_id"]
        node_type = metric["component_type"]
        if node_type == "User":
            continue
        level = node_levels.get(node_id, 0)
        level_latencies[level] = max(level_latencies[level], float(metric["latency"]))

    total_latency = sum(level_latencies.values())

    sink_nodes = [node_id for node_id, deg in outdegree.items() if deg == 0 and node_map[node_id].get("type") != "User"]
    throughput = sum(effective_rps_map.get(node_id, 0.0) for node_id in sink_nodes)
    total_error_rate = (root_rps - throughput) / root_rps if root_rps > 0 else 0.0

    performance = {
        "incoming_rps": int(root_rps),
        "throughput": int(throughput),
        "total_latency": round(total_latency, 3),
        "total_error_rate": round(total_error_rate, 3),
        "error_rate": round(total_error_rate, 3),
        "bottleneck_node_id": bottleneck_node_ids[0] if bottleneck_node_ids else None,
        "bottleneck_component": bottleneck_components[0] if bottleneck_components else "",
        "bottleneck_components": bottleneck_components,
        "bottleneck_component_ids": bottleneck_node_ids,
    }

    return performance, node_metrics
