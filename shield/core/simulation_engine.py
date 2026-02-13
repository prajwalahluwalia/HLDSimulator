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
    ordered_nodes = ordered_nodes or graph.get("nodes", []) or []
    if traffic_profile is None:
        traffic_profile = _extract_user_profile(ordered_nodes)

    number_of_users = float(traffic_profile.get("number_of_users", 0))
    requests_per_user = float(traffic_profile.get("requests_per_user", 0))
    incoming_rps = number_of_users * requests_per_user

    component_nodes = [node for node in ordered_nodes if node.get("type") != "User"]
    node_metrics: List[Dict[str, object]] = []

    total_latency = 0.0
    throughput_candidates: List[float] = []
    max_utilization = -1.0
    bottleneck_component = ""
    max_error_rate = 0.0

    for node in component_nodes:
        config = node.get("config", {}) or {}
        capacity = float(config.get("capacity", 0))
        base_latency = float(config.get("base_latency", 0))
        component_type = node.get("type", "Unknown")

        if capacity > 0:
            utilization = incoming_rps / capacity if capacity else float("inf")
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
                (incoming_rps - capacity) / incoming_rps if incoming_rps > 0 else 0.0
            )
            status = "overloaded"

        total_latency += effective_latency
        if capacity > 0:
            throughput_candidates.append(capacity)

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

    throughput = min(throughput_candidates) if throughput_candidates else 0.0

    performance = {
        "incoming_rps": int(incoming_rps),
        "throughput": int(throughput),
        "total_latency": round(total_latency, 3),
        "error_rate": round(max_error_rate, 3),
        "bottleneck_component": bottleneck_component,
    }

    return performance, node_metrics
