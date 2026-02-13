from typing import Dict, List


def generate_recommendations(
    performance: Dict[str, object],
    node_metrics: List[Dict[str, object]],
    warnings: List[str],
) -> List[str]:
    recommendations: List[str] = []

    incoming_rps = float(performance.get("incoming_rps", 0))
    throughput = float(performance.get("throughput", 0))
    error_rate = float(performance.get("error_rate", 0))

    if incoming_rps and throughput and throughput < incoming_rps:
        recommendations.append(
            "Increase capacity on the bottleneck or add replicas to match incoming RPS."
        )

    if error_rate > 0:
        recommendations.append(
            "Reduce error rate by scaling the overloaded components or throttling load."
        )

    if performance.get("total_latency", 0) and performance.get("total_latency", 0) > 500:
        recommendations.append("Optimize latency hotspots by tuning base latency or caching.")

    for metric in node_metrics:
        if metric.get("status") == "overloaded":
            component_type = metric.get("component_type")
            recommendations.append(
                f"Scale {component_type} capacity or add replicas to reduce utilization."
            )

    for warning in warnings:
        if "server" in warning.lower():
            recommendations.append("Introduce an application server tier to protect data stores.")
        if "scaling buffer" in warning.lower():
            recommendations.append("Add a cache, queue, or rate limiter to absorb load spikes.")

    if not recommendations:
        recommendations.append("Architecture looks healthy for the current load profile.")

    return list(dict.fromkeys(recommendations))
