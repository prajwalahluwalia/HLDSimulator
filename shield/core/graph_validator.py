from collections import defaultdict
from typing import Dict, List, Tuple


Node = Dict[str, object]
Graph = Dict[str, object]


def _detect_cycle(node_id, adjacency, visiting, visited):
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


def validate_graph(graph: Graph) -> Tuple[List[str], List[Node]]:
    errors: List[str] = []
    nodes = graph.get("nodes", []) or []
    edges = graph.get("edges", []) or []

    if not nodes:
        errors.append("Graph must contain at least one node.")
        return errors, []

    node_map = {node.get("id"): node for node in nodes}
    if None in node_map:
        errors.append("Each node must include a non-empty id.")

    adjacency = defaultdict(list)
    indegree = defaultdict(int)
    outdegree = defaultdict(int)

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

    entry_nodes = [node_id for node_id, deg in indegree.items() if deg == 0]
    exit_nodes = [node_id for node_id, deg in outdegree.items() if deg == 0]

    if len(entry_nodes) != 1:
        errors.append("Graph must have exactly one entry node.")
    if len(exit_nodes) != 1:
        errors.append("Graph must have exactly one exit node.")

    for node_id in node_map:
        if indegree[node_id] > 1 or outdegree[node_id] > 1:
            errors.append("Graph must be linear with max one edge in/out per node.")
            break

    visited = set()
    for node_id in node_map:
        if node_id not in visited:
            if _detect_cycle(node_id, adjacency, set(), visited):
                errors.append("Graph must not contain cycles.")
                break

    if errors:
        return errors, []

    ordered_ids: List[str] = []
    current = entry_nodes[0]
    seen = set()
    while current is not None:
        if current in seen:
            errors.append("Graph must not contain cycles.")
            break
        seen.add(current)
        ordered_ids.append(current)
        next_nodes = adjacency.get(current, [])
        current = next_nodes[0] if next_nodes else None

    if len(seen) != len(node_map):
        errors.append("Graph must not contain disconnected nodes.")

    if errors:
        return errors, []

    ordered_nodes = [node_map[node_id] for node_id in ordered_ids]
    return errors, ordered_nodes
