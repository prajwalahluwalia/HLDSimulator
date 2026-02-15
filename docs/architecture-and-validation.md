# SHIELD Documentation

This document explains SHIELD’s graph model, validation rules, simulation engine, and feature set.

## Overview
SHIELD is a system design sandbox that lets you:
- Build request flows by dragging and connecting components.
- Validate structure and layering rules.
- Simulate throughput, latency, and bottlenecks.
- Receive architectural warnings and recommendations.
- Explore Learn Mode presets with evolution stages and FAQs.

## Graph model
A graph contains `nodes` and `edges`:
- **Node**: `{ id, type, config }`
- **Edge**: `{ source, target }`

### Node types
Types are normalized via aliases (e.g., `load_balancer` → `LoadBalancer`, `rate_limiter` → `RateLimiter`).
The validator groups types into layers for ordering rules.

### Common node config fields
- `capacity` (number): Maximum requests per second.
- `base_latency` (number): Baseline latency in ms.
- `algorithm` (LoadBalancer only): `round_robin`, `least_capacity`, `weighted_round_robin`.
- `weight` (target nodes for weighted round robin): numeric weight value.

### Edges
Edges are directed: traffic flows from `source` to `target`.

## Validation rules
Validation lives in `shield/core/graph/validator.py` and runs on `/api/validate` and `/simulate`.

### Structural rules
- Graph must contain at least one node.
- Every node must have a unique, non-empty `id`.
- Graph must be a DAG (no cycles).
- Every node must be reachable from at least one `User` node.
- Must contain at least one **terminal storage** node (storage node with no outgoing edges).

### Layer model
Layers used by the validator:
- **External**: `User`
- **Edge**: `CDN`, `APIGateway`, `LoadBalancer`, `Edge`, `RateLimiter`, `Gateway`
- **Compute**: `Server`, `MatchingEngine`, `LocationService`, `TripService`, `TransactionService`, `MLInferenceService`, `RuleEngine`, `IDGenerator`, `InventoryService`, `PaymentGateway`, `InventoryLocking`, `ChatServer`
- **DataAccess**: `Cache`, `TokenBucket`
- **Storage**: `Database`, `FeatureStore`, `MessageStore`, `MediaStore`, `SearchIndex`
- **Async**: `Queue`, `EventStream`, `Worker`, `DistributedSync`
- **Notification**: `NotificationService`

### Layer ordering rules
Allowed transitions:
- External → Edge
- Edge → Edge or Compute
- Compute → Compute, DataAccess, Storage, Async, Notification
- DataAccess → Storage
- Storage → Async
- Async → Async or Storage
- Notification → (terminal)

Additional constraints:
- `User` cannot directly access `Database` or `Cache`.
- `Cache` and `Database` cannot send traffic to compute layers.
- Storage nodes must be terminal unless sending to Async.

## Graph ordering
`shield/core/graph_validator.py` performs:
1. Structural validation via the validator.
2. Topological ordering used by the simulator.

## Simulation engine
Simulation is implemented in `shield/core/simulation_engine.py` and exposed via `/simulate`.

### Inputs
- `graph`: nodes and edges.
- `traffic_profile`: `{ number_of_users, requests_per_user }`.
- `mode`: defaults to `sandbox`.

If `traffic_profile` is not supplied, it is derived from the first `User` node.

### How metrics are computed
- **Incoming RPS** starts at the entry node and propagates along edges.
- **Utilization** = incoming_rps / capacity.
- **Effective RPS** = min(incoming_rps, capacity).
- **Overflow** = max(0, incoming_rps - capacity).
- **Latency** grows quadratically when utilization > 1.
- **Total latency** is computed by summing max latency per level (topological depth).
- **Throughput** is the sum of effective RPS at sink nodes.
- **Error rate** = (incoming_rps - throughput) / incoming_rps.

### Load balancer algorithms
For LoadBalancer nodes:
- `round_robin`: even split across targets.
- `least_capacity`: weighted by target capacity.
- `weighted_round_robin`: weighted by target `weight`.

### Output fields
The response includes:
- `performance`: overall throughput, latency, error rate, bottleneck info.
- `node_metrics`: per-node utilization, latency, overflow, status.
- `recommendations`: scaling or architecture suggestions.
- `architectural_warnings`: heuristic warnings (e.g., no server tier).

## Architecture review and recommendations
- `shield/core/architecture_review.py` emits warnings based on missing tiers or risky patterns.
- `shield/core/recommendation_engine.py` turns warnings and metrics into actionable advice.

## Learn Mode
Learn Mode exposes preset designs with staged evolutions and FAQs.
- Presets are loaded from `shield/presets/*.json`.
- `/api/presets` returns a list of available designs.
- `/api/presets/<name>` returns full preset data (nodes, edges, stages, FAQs).

## UI features
- Drag components from the palette to the canvas.
- Connect nodes by dragging between port dots.
- Hover to reveal ports and the close button.
- Toggle Learn/Practice modes.
- View simulation output or FAQ panel in the right sidebar.
- Validation errors appear after attempting simulation.

## API summary
- `POST /simulate` → validate graph, run simulation, return performance metrics.
- `POST /api/validate` → structural validation only.
- `GET /api/presets` → list preset designs.
- `GET /api/presets/<name>` → fetch full preset data.
