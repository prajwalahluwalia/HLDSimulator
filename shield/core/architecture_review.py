from typing import Dict, List


Node = Dict[str, object]


def review_architecture(ordered_nodes: List[Node]) -> List[str]:
    warnings: List[str] = []
    types = [node.get("type") for node in ordered_nodes]

    if "Server" not in types:
        warnings.append("No server layer detected; add an application server tier.")

    first_non_user = next((t for t in types if t != "User"), None)
    if first_non_user == "Database":
        warnings.append("Database is directly exposed to users; add a server layer.")

    if types.count("Server") == 1:
        warnings.append("Single server instance detected; potential single point of failure.")

    if not any(t in {"Cache", "Queue", "RateLimiter"} for t in types):
        warnings.append("No scaling buffer detected (cache/queue/rate limiter).")

    return warnings
