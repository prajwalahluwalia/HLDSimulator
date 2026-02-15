from typing import Dict, List, Tuple

from .graph.validator import validate_graph as validate_structural_graph
from .graph.validator import topological_order


Node = Dict[str, object]
Graph = Dict[str, object]


def validate_graph(graph: Graph) -> Tuple[List[str], List[Node]]:
    structural = validate_structural_graph(graph)
    if not structural["valid"]:
        return structural["errors"], []

    ordered_ids, ordering_errors = topological_order(graph)
    if ordering_errors:
        return ordering_errors, []

    node_map = {node.get("id"): node for node in graph.get("nodes", []) or []}
    ordered_nodes = [node_map[node_id] for node_id in ordered_ids if node_id in node_map]
    return [], ordered_nodes
