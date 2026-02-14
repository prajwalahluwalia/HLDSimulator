const canvas = document.getElementById("canvas");
const canvasContent = document.getElementById("canvas-content");
const connections = document.getElementById("connections");
const inspector = document.getElementById("inspector");
const output = document.getElementById("output");
const simulateBtn = document.getElementById("simulate");
const resetBtn = document.getElementById("reset");
const toggleLeftPanel = document.getElementById("toggle-left-panel");
const toggleRightPanel = document.getElementById("toggle-right-panel");
const layout = document.getElementById("layout");
const openLeftPanel = document.getElementById("open-left-panel");
const openRightPanel = document.getElementById("open-right-panel");

const STORAGE_KEY = "shield-canvas-state";

const state = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeIndex: null,
  connectDrag: null,
  edgeDrag: null,
  drag: null,
  nodeCounter: 1,
  panX: 0,
  panY: 0,
  zoom: 1,
  pan: null,
  history: {
    past: [],
    future: [],
  },
};

function applyViewportTransform() {
  canvasContent.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  updateConnections();
}

function snapshotState() {
  return {
    nodes: state.nodes.map((node) => ({ ...node, config: { ...node.config } })),
    edges: state.edges.map((edge) => ({ ...edge })),
    nodeCounter: state.nodeCounter,
    panX: state.panX,
    panY: state.panY,
    zoom: state.zoom,
  };
}

function restoreState(snapshot) {
  state.nodes = snapshot.nodes.map((node) => ({ ...node, config: { ...node.config } }));
  state.edges = snapshot.edges.map((edge) => ({ ...edge }));
  state.nodeCounter = snapshot.nodeCounter;
  state.panX = snapshot.panX ?? 0;
  state.panY = snapshot.panY ?? 0;
  state.zoom = snapshot.zoom ?? 1;
  state.selectedNodeId = null;
  state.selectedEdgeIndex = null;
  canvasContent.querySelectorAll(".node").forEach((node) => node.remove());
  state.nodes.forEach((node) => renderNode(node));
  applyViewportTransform();
  clearSelection();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotState()));
  } catch (error) {
    console.warn("Failed to save SHIELD state", error);
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const snapshot = JSON.parse(saved);
    if (!snapshot || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) {
      return;
    }
    restoreState(snapshot);
  } catch (error) {
    console.warn("Failed to load SHIELD state", error);
  }
}

function pushHistory() {
  state.history.past.push(snapshotState());
  state.history.future = [];
  saveState();
}

function undo() {
  if (!state.history.past.length) return;
  const current = snapshotState();
  const previous = state.history.past.pop();
  state.history.future.push(current);
  restoreState(previous);
}

function redo() {
  if (!state.history.future.length) return;
  const current = snapshotState();
  const next = state.history.future.pop();
  state.history.past.push(current);
  restoreState(next);
}

const defaults = {
  User: { name: "User", number_of_users: 100, requests_per_user: 1 },
  LoadBalancer: { name: "Load Balancer", capacity: 800, base_latency: 20 },
  Server: { name: "Server", capacity: 500, base_latency: 50 },
  Database: { name: "Database", capacity: 300, base_latency: 80 },
  Cache: { name: "Cache", capacity: 1200, base_latency: 5 },
  Queue: { name: "Message Queue", capacity: 600, base_latency: 30 },
};

function createNode(type, x, y) {
  const id = `${type}-${state.nodeCounter++}`;
  const node = {
    id,
    type,
    config: { ...defaults[type] },
    x,
    y,
    width: 80,
    height: 40,
  };
  state.nodes.push(node);
  renderNode(node);
  updateConnections();
  pushHistory();
}

function renderNode(node) {
  const el = document.createElement("div");
  el.className = `node node-${node.type.toLowerCase()}`;
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  el.style.width = `${node.width}px`;
  el.style.height = `${node.height}px`;
  el.dataset.nodeId = node.id;
  const label = document.createElement("span");
  label.className = "node-label";
  label.textContent = node.config.name || node.type;
  el.appendChild(label);

  const closeBtn = document.createElement("button");
  closeBtn.className = "node-close";
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    deleteNode(node.id);
  });
  el.appendChild(closeBtn);

  const ports = document.createElement("div");
  ports.className = "node-ports";
  PORTS.forEach((port) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `node-port node-port-${port.name}`;
    dot.setAttribute("aria-label", `Connect ${port.name}`);
    dot.addEventListener("mousedown", (event) => {
      event.stopPropagation();
      event.preventDefault();
      const nodeRect = el.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const portX = (nodeRect.left - canvasRect.left + nodeRect.width * port.dx - state.panX) / state.zoom;
      const portY = (nodeRect.top - canvasRect.top + nodeRect.height * port.dy - state.panY) / state.zoom;
      beginConnectDrag(event, node.id, { x: portX, y: portY });
    });
    ports.appendChild(dot);
  });
  el.appendChild(ports);

  el.addEventListener("mousedown", (event) => startDrag(event, node.id, "node"));
  el.addEventListener("click", (event) => {
    event.stopPropagation();
    handleNodeClick(node.id);
  });
  el.addEventListener("mouseup", () => syncNodeSize(node.id));

  canvasContent.appendChild(el);
  autoSizeNode(node.id);
}

function startDrag(event, id, kind) {
  if (kind === "node") {
    const node = getNode(id);
    const el = getNodeElement(id);
    if (!node || !el) return;
    if (event.shiftKey) {
      beginConnectDrag(event, node.id, null);
      return;
    }
    const elRect = el.getBoundingClientRect();
    const isResizeHandle =
      event.clientX - elRect.left > elRect.width - 18 &&
      event.clientY - elRect.top > elRect.height - 18;
    if (isResizeHandle) {
      return;
    }
    const canvasRect = canvas.getBoundingClientRect();
    const pointerX = (event.clientX - canvasRect.left - state.panX) / state.zoom;
    const pointerY = (event.clientY - canvasRect.top - state.panY) / state.zoom;
    state.drag = {
      kind,
      id,
      offsetX: pointerX - node.x,
      offsetY: pointerY - node.y,
    };
    return;
  }
}

function handleNodeClick(nodeId) {
  selectNode(nodeId);
}

function selectNode(nodeId) {
  state.selectedNodeId = nodeId;
  highlightSelectedNode(nodeId);
  const node = getNode(nodeId);
  if (!node) return;
  renderInspector(node);
}

function highlightSelectedNode(nodeId) {
  canvasContent.querySelectorAll(".node").forEach((nodeEl) => {
    nodeEl.classList.toggle("selected", nodeEl.dataset.nodeId === nodeId);
  });
}

function highlightConnectSource(nodeId) {
  canvasContent.querySelectorAll(".node").forEach((nodeEl) => {
    nodeEl.classList.toggle("connect-source", nodeEl.dataset.nodeId === nodeId);
  });
}

function renderInspector(node) {
  const baseFields = [
    { key: "name", label: "Component name" },
  ];
  const fields = node.type === "User"
    ? [
        ...baseFields,
        { key: "number_of_users", label: "Number of users" },
        { key: "requests_per_user", label: "Requests per user" },
      ]
    : [
        ...baseFields,
        { key: "capacity", label: "Capacity (RPS)" },
        { key: "base_latency", label: "Base latency (ms)" },
      ];

  inspector.innerHTML = `
    <div class="inspector-header">
      <strong>${node.type}</strong>
      <span class="node-id">${node.id}</span>
    </div>
    <div class="inspector-fields">
      ${fields
        .map((field) => {
          const isName = field.key === "name";
          const inputType = isName ? "text" : "number";
          const step = isName ? "" : "step=\"0.1\"";
          return `
        <label>
          ${field.label}
          <input type="${inputType}" ${step} data-key="${field.key}" value="${node.config[field.key] ?? ""}" />
        </label>
      `;
        })
        .join("")}
    </div>
  `;

  inspector.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", (event) => {
      const key = event.target.dataset.key;
      if (key === "name") {
        node.config[key] = event.target.value;
        const el = getNodeElement(node.id);
        const label = el ? el.querySelector(".node-label") : null;
        if (label) {
          label.textContent = node.config.name || node.type;
        }
        autoSizeNode(node.id);
        return;
      }
      node.config[key] = Number(event.target.value);
    });
  });
}

function addEdge(source, target) {
  if (state.edges.some((edge) => edge.source === source && edge.target === target)) {
    return;
  }
  state.edges.push({ source, target });
  updateConnections();
  pushHistory();
}

function updateConnections() {
  connections.innerHTML = `
    <defs>
      <marker id="arrow" viewBox="0 0 12 12" markerWidth="12" markerHeight="9.5" refX="11" refY="6" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M0,0 L12,6 L0,12 z" fill="#111827" />
      </marker>
    </defs>
  `;
  state.edges.forEach((edge, index) => {
    const source = getNode(edge.source);
    const target = getNode(edge.target);
    if (!source || !target) return;
    const x1 = source.x + source.width / 2;
    const y1 = source.y + source.height / 2;
    const { x2, y2, cx1, cy1, cx2, cy2, control } = getEdgeGeometry(
      x1,
      y1,
      source,
      target,
      edge
    );

    const shouldCurve = control || edgeIntersectsNode(x1, y1, x2, y2, source, target);
    const pathData = control
      ? `M ${x1} ${y1} Q ${control.x} ${control.y}, ${x2} ${y2}`
      : shouldCurve
        ? `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`
        : `M ${x1} ${y1} L ${x2} ${y2}`;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
  path.setAttribute("stroke", "#111827");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
    path.setAttribute("fill", "none");
    path.setAttribute("marker-end", "url(#arrow)");
    path.dataset.edgeIndex = String(index);
    path.classList.add("connection-path");
    if (state.selectedEdgeIndex === index) {
      path.classList.add("selected");
    }
    path.addEventListener("click", (event) => {
      event.stopPropagation();
      state.selectedEdgeIndex = index;
      state.selectedNodeId = null;
      clearSelection();
      updateConnections();
    });
    path.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      removeEdge(index);
    });
    path.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      removeEdge(index);
    });
    connections.appendChild(path);

    if (state.selectedEdgeIndex === index) {
      const handlePoint = getEdgeHandlePoint(x1, y1, x2, y2, cx1, cy1, cx2, cy2, control);
      const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      handle.setAttribute("cx", String(handlePoint.x));
      handle.setAttribute("cy", String(handlePoint.y));
      handle.setAttribute("r", "6");
      handle.classList.add("connection-handle");
      handle.addEventListener("mousedown", (event) => {
        event.stopPropagation();
        event.preventDefault();
        const point = getCanvasPoint(event);
        state.edgeDrag = {
          index,
          offsetX: point.x - handlePoint.x,
          offsetY: point.y - handlePoint.y,
        };
      });
      connections.appendChild(handle);
    }
  });
}

function getEdgeGeometry(x1, y1, source, target, edge) {
  const targetCenterX = target.x + target.width / 2;
  const targetCenterY = target.y + target.height / 2;
  const dx = targetCenterX - x1;
  const dy = targetCenterY - y1;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const pad = 4;

  let x2 = targetCenterX;
  let y2 = targetCenterY;
  if (absDx > 0 || absDy > 0) {
    const halfW = target.width / 2 + pad;
    const halfH = target.height / 2 + pad;
    const scaleX = absDx > 0 ? halfW / absDx : Infinity;
    const scaleY = absDy > 0 ? halfH / absDy : Infinity;
    const scale = Math.min(scaleX, scaleY);
    x2 = targetCenterX - dx * scale;
    y2 = targetCenterY - dy * scale;
  }

  const distance = Math.hypot(dx, dy);
  const baseCurve = Math.min(90, Math.max(30, distance * 0.25));
  const normX = distance === 0 ? 0 : -dy / distance;
  const normY = distance === 0 ? 0 : dx / distance;
  const curve = Math.min(140, baseCurve + 40);
  const curveX = normX * curve;
  const curveY = normY * curve;
  const cx1 = x1 + dx * 0.25 + curveX;
  const cy1 = y1 + dy * 0.25 + curveY;
  const cx2 = x1 + dx * 0.75 + curveX;
  const cy2 = y1 + dy * 0.75 + curveY;

  if (edge.control) {
    return { x2, y2, control: edge.control };
  }

  return { x2, y2, cx1, cy1, cx2, cy2, control: null };
}

function edgeIntersectsNode(x1, y1, x2, y2, source, target) {
  return state.nodes.some((node) => {
    if (node.id === source.id || node.id === target.id) return false;
    const rect = {
      left: node.x,
      right: node.x + node.width,
      top: node.y,
      bottom: node.y + node.height,
    };
    return lineIntersectsRect(x1, y1, x2, y2, rect);
  });
}

function lineIntersectsRect(x1, y1, x2, y2, rect) {
  if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) {
    return true;
  }
  const edges = [
    [rect.left, rect.top, rect.right, rect.top],
    [rect.right, rect.top, rect.right, rect.bottom],
    [rect.right, rect.bottom, rect.left, rect.bottom],
    [rect.left, rect.bottom, rect.left, rect.top],
  ];
  return edges.some(([ex1, ey1, ex2, ey2]) => lineIntersectsLine(x1, y1, x2, y2, ex1, ey1, ex2, ey2));
}

function pointInRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (den === 0) return false;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function getEdgeHandlePoint(x1, y1, x2, y2, cx1, cy1, cx2, cy2, control) {
  if (control) {
    return { x: control.x, y: control.y };
  }
  if (!cx1 || !cy1 || !cx2 || !cy2) {
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }
  const t = 0.5;
  const x = cubicBezier(x1, cx1, cx2, x2, t);
  const y = cubicBezier(y1, cy1, cy2, y2, t);
  return { x, y };
}

function cubicBezier(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return u ** 3 * p0 + 3 * u ** 2 * t * p1 + 3 * u * t ** 2 * p2 + t ** 3 * p3;
}

function getCanvasPoint(event) {
  const canvasRect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - canvasRect.left - state.panX) / state.zoom,
    y: (event.clientY - canvasRect.top - state.panY) / state.zoom,
  };
}

function getNode(id) {
  return state.nodes.find((node) => node.id === id);
}

function getNodeElement(id) {
  return canvasContent.querySelector(`[data-node-id="${id}"]`);
}

function clearSelection() {
  state.selectedNodeId = null;
  state.selectedEdgeIndex = null;
  highlightSelectedNode(null);
  highlightConnectSource(null);
  inspector.innerHTML = "<p>Select a node to edit its parameters.</p>";
}

function resetCanvas() {
  state.nodes = [];
  state.edges = [];
  state.selectedNodeId = null;
  state.selectedEdgeIndex = null;
  state.connectSource = null;
  state.connectDrag = null;
  state.nodeCounter = 1;
  state.panX = 0;
  state.panY = 0;
  state.zoom = 1;
  applyViewportTransform();
  canvasContent.querySelectorAll(".node").forEach((node) => node.remove());
  updateConnections();
  clearSelection();
  output.innerHTML = "<p>Run a simulation to see results.</p>";
  pushHistory();
}

function deleteNode(nodeId) {
  state.nodes = state.nodes.filter((node) => node.id !== nodeId);
  state.edges = state.edges.filter(
    (edge) => edge.source !== nodeId && edge.target !== nodeId
  );
  const el = getNodeElement(nodeId);
  if (el) {
    el.remove();
  }
  state.connectSource = null;
  state.selectedNodeId = null;
  state.selectedEdgeIndex = null;
  highlightSelectedNode(null);
  highlightConnectSource(null);
  updateConnections();
  clearSelection();
  pushHistory();
}

function deleteSelectedEdge() {
  if (state.selectedEdgeIndex === null) return;
  removeEdge(state.selectedEdgeIndex);
}

function removeEdge(index) {
  if (index === null || index < 0 || index >= state.edges.length) return;
  state.edges.splice(index, 1);
  state.selectedEdgeIndex = null;
  updateConnections();
  pushHistory();
}

function syncNodeSize(nodeId) {
  const node = getNode(nodeId);
  const el = getNodeElement(nodeId);
  if (!node || !el) return;
  const prevWidth = node.width;
  const prevHeight = node.height;
  node.width = el.offsetWidth;
  node.height = el.offsetHeight;
  updateConnections();
  if (prevWidth !== node.width || prevHeight !== node.height) {
    pushHistory();
  }
}

function autoSizeNode(nodeId) {
  const node = getNode(nodeId);
  const el = getNodeElement(nodeId);
  if (!node || !el) return;
  const label = el.querySelector(".node-label");
  if (!label) return;
  requestAnimationFrame(() => {
    const paddingX = 28;
    const paddingY = 16;
  const minWidth = 80;
  const minHeight = 40;
    const nextWidth = Math.max(minWidth, Math.ceil(label.scrollWidth + paddingX));
    const nextHeight = Math.max(minHeight, Math.ceil(label.scrollHeight + paddingY));
    node.width = nextWidth;
    node.height = nextHeight;
    el.style.width = `${nextWidth}px`;
    el.style.height = `${nextHeight}px`;
    updateConnections();
    saveState();
  });
}

function handleSimulationResult(result) {
  const warnings = result.architectural_warnings || [];
  const structural = result.structural_errors || [];
  const performance = result.performance || {};
  const nodeMetrics = result.node_metrics || [];
  const recommendations = result.recommendations || [];
  const bottleneckIds = performance.bottleneck_component_ids || [];
  const bottleneckComponents = performance.bottleneck_components || [];

  canvasContent.querySelectorAll(".node").forEach((nodeEl) => {
    nodeEl.classList.remove("bottleneck");
  });
  bottleneckIds.forEach((nodeId) => {
    const nodeEl = getNodeElement(nodeId);
    if (nodeEl) {
      nodeEl.classList.add("bottleneck");
    }
  });

  output.innerHTML = `
    <div class="result-section">
      <h3>Summary</h3>
      <p><strong>Structural errors:</strong> ${structural.length}</p>
      <p><strong>Architectural warnings:</strong> ${warnings.length}</p>
    </div>
    ${structural.length ? `<div class="result-block"><h4>Structural errors</h4><ul>${structural
      .map((item) => `<li>${item}</li>`)
      .join("")}</ul></div>` : ""}
    ${warnings.length ? `<div class="result-block"><h4>Architectural warnings</h4><ul>${warnings
      .map((item) => `<li>${item}</li>`)
      .join("")}</ul></div>` : ""}
    <div class="result-block">
      <h4>Performance</h4>
      <ul>
        <li>Incoming RPS: ${performance.incoming_rps ?? 0}</li>
        <li>Throughput: ${performance.throughput ?? 0}</li>
        <li>Total latency: ${performance.total_latency ?? 0} ms</li>
        <li>Error rate: ${performance.error_rate ?? 0}</li>
        <li>Bottleneck: ${bottleneckComponents.length ? bottleneckComponents.join(", ") : (performance.bottleneck_component ?? "N/A")}</li>
      </ul>
    </div>
    <div class="result-block">
      <h4>Node metrics</h4>
      <ul>
        ${nodeMetrics
          .map(
            (metric) => `
          <li>
            <strong>${metric.component_type}</strong> — Utilization: ${metric.utilization ?? "N/A"},
            Latency: ${metric.latency_contribution ?? "N/A"} ms, Status: ${metric.status}
          </li>
        `
          )
          .join("")}
      </ul>
    </div>
    ${recommendations.length ? `<div class="result-block"><h4>Recommendations</h4><ul>${recommendations
      .map((item) => `<li>${item}</li>`)
      .join("")}</ul></div>` : ""}
  `;
}

function beginConnectDrag(event, sourceId, sourcePoint) {
  const node = getNode(sourceId);
  if (!node) return;
  const source = sourcePoint || {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  };
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("stroke", "#111827");
  path.setAttribute("stroke-width", "1");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-dasharray", "4 4");
  path.setAttribute("marker-end", "url(#arrow)");
  connections.appendChild(path);
  state.connectDrag = {
    sourceId,
    path,
    source,
  };
}

function buildGraphPayload() {
  return {
    graph: {
      nodes: state.nodes.map(({ id, type, config }) => ({ id, type, config })),
      edges: state.edges,
    },
  };
}

function attachPaletteDrag() {
  document.querySelectorAll(".palette-item").forEach((item) => {
    item.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", item.dataset.type);
    });

    item.addEventListener("dblclick", () => {
      const type = item.dataset.type;
      if (!type) return;
      const canvasRect = canvas.getBoundingClientRect();
      const x = (canvasRect.width / 2 - state.panX) / state.zoom - 40;
      const y = (canvasRect.height / 2 - state.panY) / state.zoom - 20;
      createNode(type, x, y);
    });
  });

  canvas.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  canvas.addEventListener("drop", (event) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("text/plain");
    if (!type) return;
    const canvasRect = canvas.getBoundingClientRect();
    const x = (event.clientX - canvasRect.left - 40 - state.panX) / state.zoom;
    const y = (event.clientY - canvasRect.top - 20 - state.panY) / state.zoom;
    createNode(type, x, y);
  });
}

canvas.addEventListener("mousedown", (event) => {
  if (event.button === 1 || event.altKey || event.button === 0) {
    if (event.button === 0 && !event.altKey) {
      const isNode = event.target.closest(".node");
      if (event.target.closest(".node-port")) return;
      if (isNode) return;
    }
    const isNode = event.target.closest(".node");
    if (isNode) return;
    state.pan = {
      startX: event.clientX,
      startY: event.clientY,
      originX: state.panX,
      originY: state.panY,
    };
  }
});

canvas.addEventListener("mousemove", (event) => {
  if (state.edgeDrag) {
    const point = getCanvasPoint(event);
    const edge = state.edges[state.edgeDrag.index];
    if (edge) {
      edge.control = {
        x: point.x - state.edgeDrag.offsetX,
        y: point.y - state.edgeDrag.offsetY,
      };
      updateConnections();
      saveState();
    }
    return;
  }
  if (state.pan) {
    const dx = event.clientX - state.pan.startX;
    const dy = event.clientY - state.pan.startY;
    state.panX = state.pan.originX + dx;
    state.panY = state.pan.originY + dy;
    applyViewportTransform();
    return;
  }
  if (state.connectDrag) {
    const { source, path } = state.connectDrag;
    const canvasRect = canvas.getBoundingClientRect();
    const x2 = (event.clientX - canvasRect.left - state.panX) / state.zoom;
    const y2 = (event.clientY - canvasRect.top - state.panY) / state.zoom;
    const offsetX = (x2 - source.x) * 0.3;
    const offsetY = -30;
    const cx1 = source.x + offsetX;
    const cy1 = source.y + offsetY;
    const cx2 = x2 - offsetX;
    const cy2 = y2 + offsetY;
    path.setAttribute(
      "d",
      `M ${source.x} ${source.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`
    );
    return;
  }
  if (!state.drag) return;
  if (state.drag.kind === "node") {
    const node = getNode(state.drag.id);
    if (!node) return;
    const canvasRect = canvas.getBoundingClientRect();
    const pointerX = (event.clientX - canvasRect.left - state.panX) / state.zoom;
    const pointerY = (event.clientY - canvasRect.top - state.panY) / state.zoom;
    node.x = pointerX - state.drag.offsetX;
    node.y = pointerY - state.drag.offsetY;
    const el = getNodeElement(node.id);
    if (el) {
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
    }
    updateConnections();
    return;
  }
});

canvas.addEventListener("mouseup", (event) => {
  if (state.connectDrag) {
    const { sourceId, path } = state.connectDrag;
    const targetId = getNodeIdFromPoint(event);
    if (targetId && targetId !== sourceId) {
      addEdge(sourceId, targetId);
    }
    if (path) {
      path.remove();
    }
    state.connectDrag = null;
  }
  if (state.drag && state.drag.kind === "node") {
    pushHistory();
  }
  if (state.edgeDrag) {
    pushHistory();
  }
  state.drag = null;
  state.pan = null;
  state.edgeDrag = null;
});

canvas.addEventListener("mouseleave", () => {
  state.drag = null;
  state.pan = null;
  state.edgeDrag = null;
});

canvas.addEventListener("click", () => {
  clearSelection();
});

document.addEventListener("keydown", (event) => {
  const isMac = navigator.platform.toLowerCase().includes("mac");
  const modifier = isMac ? event.metaKey : event.ctrlKey;
  if (!modifier) return;

  if (event.key.toLowerCase() === "z" && !event.shiftKey) {
    event.preventDefault();
    undo();
  }

  if (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey)) {
    event.preventDefault();
    redo();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Delete" || event.key === "Backspace") {
    deleteSelectedEdge();
  }
});

const PORTS = [
  { name: "top", dx: 0.5, dy: 0 },
  { name: "right", dx: 1, dy: 0.5 },
  { name: "bottom", dx: 0.5, dy: 1 },
  { name: "left", dx: 0, dy: 0.5 },
];

toggleLeftPanel.addEventListener("click", () => {
  layout.classList.toggle("left-collapsed");
});

if (toggleRightPanel) {
  toggleRightPanel.addEventListener("click", () => {
    layout.classList.toggle("right-collapsed");
  });
}

if (openLeftPanel) {
  openLeftPanel.addEventListener("click", () => {
    layout.classList.remove("left-collapsed");
  });
}

if (openRightPanel) {
  openRightPanel.addEventListener("click", () => {
    layout.classList.remove("right-collapsed");
  });
}

function getNodeIdFromPoint(event) {
  const element = document.elementFromPoint(event.clientX, event.clientY);
  if (!element) return null;
  const nodeElement = element.closest(".node");
  if (!nodeElement) return null;
  return nodeElement.dataset.nodeId;
}

canvas.addEventListener("wheel", (event) => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  const delta = event.deltaY > 0 ? -0.05 : 0.05;
  const nextZoom = Math.min(2, Math.max(0.5, state.zoom + delta));
  const canvasRect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - canvasRect.left;
  const mouseY = event.clientY - canvasRect.top;
  const zoomFactor = nextZoom / state.zoom;

  state.panX = mouseX - (mouseX - state.panX) * zoomFactor;
  state.panY = mouseY - (mouseY - state.panY) * zoomFactor;
  state.zoom = nextZoom;
  applyViewportTransform();
}, { passive: false });

document.addEventListener("keydown", (event) => {
  const isMac = navigator.platform.toLowerCase().includes("mac");
  const modifier = isMac ? event.metaKey : event.ctrlKey;
  if (!modifier) return;

  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    state.zoom = Math.min(2, state.zoom + 0.05);
    applyViewportTransform();
  }

  if (event.key === "-") {
    event.preventDefault();
    state.zoom = Math.max(0.5, state.zoom - 0.05);
    applyViewportTransform();
  }

  if (event.key.toLowerCase() === "0") {
    event.preventDefault();
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    applyViewportTransform();
  }
});

simulateBtn.addEventListener("click", async () => {
  const payload = buildGraphPayload();
  const response = await fetch("/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  handleSimulationResult(data);
});

resetBtn.addEventListener("click", resetCanvas);

attachPaletteDrag();

loadState();
