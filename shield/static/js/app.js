const canvas = document.getElementById("canvas");
const canvasContent = document.getElementById("canvas-content");
const connections = document.getElementById("connections");
const inspector = document.getElementById("inspector");
const output = document.getElementById("output");
const toggleConnect = document.getElementById("toggle-connect");
const simulateBtn = document.getElementById("simulate");
const resetBtn = document.getElementById("reset");
const toggleLeftPanel = document.getElementById("toggle-left-panel");
const toggleRightPanel = document.getElementById("toggle-right-panel");
const layout = document.getElementById("layout");
const openLeftPanel = document.getElementById("open-left-panel");
const openRightPanel = document.getElementById("open-right-panel");

const state = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeIndex: null,
  connectMode: false,
  connectSource: null,
  connectDrag: null,
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
  };
}

function restoreState(snapshot) {
  state.nodes = snapshot.nodes.map((node) => ({ ...node, config: { ...node.config } }));
  state.edges = snapshot.edges.map((edge) => ({ ...edge }));
  state.nodeCounter = snapshot.nodeCounter;
  state.selectedNodeId = null;
  state.selectedEdgeIndex = null;
  canvasContent.querySelectorAll(".node").forEach((node) => node.remove());
  state.nodes.forEach((node) => renderNode(node));
  updateConnections();
  clearSelection();
}

function pushHistory() {
  state.history.past.push(snapshotState());
  state.history.future = [];
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
    width: 140,
    height: 60,
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
  el.textContent = node.config.name || node.type;

  el.addEventListener("mousedown", (event) => startDrag(event, node.id, "node"));
  el.addEventListener("click", (event) => {
    event.stopPropagation();
    handleNodeClick(node.id);
  });
  el.addEventListener("mouseup", () => syncNodeSize(node.id));

  canvasContent.appendChild(el);
}

function startDrag(event, id, kind) {
  if (kind === "node") {
    const node = getNode(id);
    const el = getNodeElement(id);
    if (!node || !el) return;
    if (state.connectMode && !event.shiftKey) {
      return;
    }
    if (event.shiftKey) {
      beginConnectDrag(event, node.id);
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
  if (state.connectMode) {
    if (!state.connectSource) {
      state.connectSource = nodeId;
      highlightConnectSource(nodeId);
    } else if (state.connectSource !== nodeId) {
      addEdge(state.connectSource, nodeId);
      highlightConnectSource(null);
      state.connectSource = null;
    }
    return;
  }
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
    <button id="delete-node" class="button ghost">Delete component</button>
  `;

  inspector.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", (event) => {
      const key = event.target.dataset.key;
      if (key === "name") {
        node.config[key] = event.target.value;
        const el = getNodeElement(node.id);
        if (el) {
          el.textContent = node.config.name || node.type;
        }
        return;
      }
      node.config[key] = Number(event.target.value);
    });
  });

  const deleteBtn = inspector.querySelector("#delete-node");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      deleteNode(node.id);
    });
  }
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
      <marker id="arrow" viewBox="0 0 12 12" markerWidth="10" markerHeight="10" refX="12" refY="6" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M0,0 L12,6 L0,12 z" fill="#2563eb" />
      </marker>
    </defs>
  `;
  state.edges.forEach((edge, index) => {
    const source = getNode(edge.source);
    const target = getNode(edge.target);
    if (!source || !target) return;
    const x1 = source.x + source.width / 2;
    const y1 = source.y + source.height / 2;
    const x2 = target.x + target.width / 2;
    const y2 = target.y + target.height / 2;

    const offsetX = (x2 - x1) * 0.3;
    const offsetY = -40;
    const cx1 = x1 + offsetX;
    const cy1 = y1 + offsetY;
    const cx2 = x2 - offsetX;
    const cy2 = y2 + offsetY;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`
    );
    path.setAttribute("stroke", "#2563eb");
    path.setAttribute("stroke-width", "2");
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
    connections.appendChild(path);
  });
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
  state.edges.splice(state.selectedEdgeIndex, 1);
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

function handleSimulationResult(result) {
  const warnings = result.architectural_warnings || [];
  const structural = result.structural_errors || [];
  const performance = result.performance || {};
  const nodeMetrics = result.node_metrics || [];
  const recommendations = result.recommendations || [];

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
        <li>Bottleneck: ${performance.bottleneck_component ?? "N/A"}</li>
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

function beginConnectDrag(event, sourceId) {
  const node = getNode(sourceId);
  if (!node) return;
  const source = {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  };
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("stroke", "#2563eb");
  path.setAttribute("stroke-width", "2");
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
  state.drag = null;
  state.pan = null;
});

canvas.addEventListener("mouseleave", () => {
  state.drag = null;
  state.pan = null;
});

canvas.addEventListener("click", () => {
  if (!state.connectMode) {
    clearSelection();
  }
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

toggleConnect.addEventListener("click", () => {
  state.connectMode = !state.connectMode;
  state.connectSource = null;
  toggleConnect.textContent = `Connector mode: ${state.connectMode ? "On" : "Off"}`;
  document.body.classList.toggle("connect-mode", state.connectMode);
});

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
