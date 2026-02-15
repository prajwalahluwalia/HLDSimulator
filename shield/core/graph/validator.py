from __future__ import annotations

from collections import defaultdict, deque
from typing import Dict, List, Set, Tuple

Node = Dict[str, object]
Graph = Dict[str, object]


TYPE_ALIASES = {
    "user": "User",
    "cdn": "CDN",
    "apigateway": "APIGateway",
    "api_gateway": "APIGateway",
    "loadbalancer": "LoadBalancer",
    "load_balancer": "LoadBalancer",
    "edge": "Edge",
    "ratelimiter": "RateLimiter",
    "rate_limiter": "RateLimiter",
    "server": "Server",
    "appserver": "Server",
    "matchingengine": "MatchingEngine",
    "locationservice": "LocationService",
    "tripservice": "TripService",
    "transactionservice": "TransactionService",
    "mlinferenceservice": "MLInferenceService",
    "mlservice": "MLInferenceService",
    "ruleengine": "RuleEngine",
    "idgenerator": "IDGenerator",
    "inventoryservice": "InventoryService",
    "paymentgateway": "PaymentGateway",
    "inventorylocking": "InventoryLocking",
    "inventorylockinglayer": "InventoryLocking",
    "cache": "Cache",
    "redis": "Cache",
    "featurestore": "FeatureStore",
    "database": "Database",
    "messagestore": "MessageStore",
    "mediastore": "MediaStore",
    "searchindex": "SearchIndex",
    "queue": "Queue",
    "eventstream": "EventStream",
    "eventqueue": "EventStream",
    "worker": "Worker",
    "notificationservice": "NotificationService",
    "gateway": "Gateway",
    "chatserver": "ChatServer",
    "tokenbucket": "TokenBucket",
    "distributedsync": "DistributedSync",
}

LAYER_MAP = {
    "User": "External",
    "CDN": "Edge",
    "APIGateway": "Edge",
    "LoadBalancer": "Edge",
    "Edge": "Edge",
    "RateLimiter": "Edge",
    "Gateway": "Edge",
    "Server": "Compute",
    "MatchingEngine": "Compute",
    "LocationService": "Compute",
    "TripService": "Compute",
    "TransactionService": "Compute",
    "MLInferenceService": "Compute",
    "RuleEngine": "Compute",
    "IDGenerator": "Compute",
    "InventoryService": "Compute",
    "PaymentGateway": "Compute",
    "InventoryLocking": "Compute",
    "ChatServer": "Compute",
    "Cache": "DataAccess",
    "Database": "Storage",
    "FeatureStore": "Storage",
    "MessageStore": "Storage",
    "MediaStore": "Storage",
    "SearchIndex": "Storage",
    "Queue": "Async",
    "EventStream": "Async",
    "Worker": "Async",
    "TokenBucket": "DataAccess",
    "DistributedSync": "Async",
    "NotificationService": "Notification",
}

ALLOWED_TRANSITIONS = {
    "External": {"Edge"},
    "Edge": {"Compute"},
    "Compute": {"Compute", "DataAccess", "Storage", "Async", "Notification"},
    "DataAccess": {"Storage"},
    "Storage": {"Async"},
    "Async": {"Async", "Storage"},
    "Notification": set(),
}


def normalize_type(node_type: object) -> str:
    if not node_type:
        return "Server"
    raw = str(node_type).strip()
    key = raw.lower().replace(" ", "").replace("-", "_")
    return TYPE_ALIASES.get(key, raw)


def _detect_cycle(node_id: str, adjacency: Dict[str, List[str]], visiting: Set[str], visited: Set[str]) -> bool:
    visiting.add(node_id)
    for neighbor in adjacency.get(node_id, []):
        if neighbor in visiting:
            return True
        if neighbor not in visited:
            if _detect_cycle(neighbor, adjacency, visiting, visited):
                return True
    visiting.remove(node_id)
    visited.add(node_id)
    return False


def validate_graph(graph: Graph) -> Dict[str, object]:
    errors: List[str] = []
    nodes = graph.get("nodes", []) or []
    edges = graph.get("edges", []) or []

    if not nodes:
        return {"valid": False, "errors": ["Graph must contain at least one node."]}

    node_map = {node.get("id"): node for node in nodes if node.get("id")}
    if len(node_map) != len(nodes):
        errors.append("Each node must include a non-empty id.")

    adjacency: Dict[str, List[str]] = defaultdict(list)
    indegree: Dict[str, int] = defaultdict(int)
    outdegree: Dict[str, int] = defaultdict(int)

    for edge in edges:
        source = edge.get("source")
        target = edge.get("target")
        if source not in node_map or target not in node_map:
            errors.append("Edges must reference valid node ids.")
            continue
        if source == target:
            errors.append("Self-referential edges are not allowed.")
            continue
        adjacency[source].append(target)
        indegree[target] += 1
        outdegree[source] += 1

    for node_id in node_map:
        indegree.setdefault(node_id, 0)
        outdegree.setdefault(node_id, 0)

    user_nodes = [node_id for node_id, node in node_map.items() if normalize_type(node.get("type")) == "User"]
    if not user_nodes:
        errors.append("Graph must contain at least one User node.")

    visited = set()
    for node_id in node_map:
        if node_id not in visited:
            if _detect_cycle(node_id, adjacency, set(), visited):
                errors.append("Graph must be a DAG.")
                break

    if user_nodes:
        reachable: Set[str] = set()
        queue = deque(user_nodes)
        while queue:
            node_id = queue.popleft()
            if node_id in reachable:
                continue
            reachable.add(node_id)
            for neighbor in adjacency.get(node_id, []):
                if neighbor not in reachable:
                    queue.append(neighbor)
        unreachable = [node_id for node_id in node_map if node_id not in reachable]
        if unreachable:
            errors.append("All nodes must be reachable from a User node.")

    storage_nodes = [node_id for node_id, node in node_map.items() if LAYER_MAP.get(normalize_type(node.get("type"))) == "Storage"]
    if not any(outdegree[node_id] == 0 for node_id in storage_nodes):
        errors.append("Graph must contain at least one terminal storage node.")

    for source, targets in adjacency.items():
        source_type = normalize_type(node_map[source].get("type"))
        source_layer = LAYER_MAP.get(source_type, "Compute")
        for target in targets:
            target_type = normalize_type(node_map[target].get("type"))
            target_layer = LAYER_MAP.get(target_type, "Compute")

            if source_type == "User" and target_type in {"Database", "Cache"}:
                errors.append("User cannot directly access storage or cache layers.")

            if source_type == "Cache" and target_layer == "Compute":
                errors.append("Cache cannot send traffic to compute layers.")

            if source_type == "Database" and target_layer == "Compute":
                errors.append("Database cannot send traffic to compute layers.")

            if source_layer == "Storage" and target_layer not in {"Async"}:
                errors.append("Storage nodes must be terminal unless sending to async processing.")

            if target_layer not in ALLOWED_TRANSITIONS.get(source_layer, set()):
                errors.append("Illegal layer ordering detected.")

    return {"valid": len(errors) == 0, "errors": sorted(set(errors))}


def topological_order(graph: Graph) -> Tuple[List[str], List[str]]:
    nodes = graph.get("nodes", []) or []
    edges = graph.get("edges", []) or []
    node_map = {node.get("id"): node for node in nodes if node.get("id")}

    adjacency = defaultdict(list)
    indegree = defaultdict(int)

    for edge in edges:
        source = edge.get("source")
        target = edge.get("target")
        if source not in node_map or target not in node_map:
            continue
        if source == target:
            continue
        adjacency[source].append(target)
        indegree[target] += 1

    for node_id in node_map:
        indegree.setdefault(node_id, 0)

    queue = deque([node_id for node_id, deg in indegree.items() if deg == 0])
    ordered = []

    while queue:
        node_id = queue.popleft()
        ordered.append(node_id)
        for neighbor in adjacency.get(node_id, []):
            indegree[neighbor] -= 1
            if indegree[neighbor] == 0:
                queue.append(neighbor)

    if len(ordered) != len(node_map):
        return [], ["Graph must not contain disconnected nodes."]

    return ordered, []
