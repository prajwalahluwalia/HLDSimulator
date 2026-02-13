const canvas = document.getElementById("canvas");
const connections = document.getElementById("connections");
const inspector = document.getElementById("inspector");
const output = document.getElementById("output");
const toggleConnect = document.getElementById("toggle-connect");
const simulateBtn = document.getElementById("simulate");
const resetBtn = document.getElementById("reset");
const toggleLeftPanel = document.getElementById("toggle-left-panel");
const layout = document.getElementById("layout");

const state = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  connectMode: false,
  connectSource: null,
  connectDrag: null,
  drag: null,
  nodeCounter: 1,
};

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

  canvas.appendChild(el);
}

function startDrag(event, id, kind) {
  if (kind === "node") {
    const node = getNode(id);
    const el = getNodeElement(id);
    if (!node || !el) return;
    if (event.shiftKey) {
      beginConnectDrag(event, node.id);
      return;
    }
    const isResizeHandle =
      event.offsetX > el.clientWidth - 18 && event.offsetY > el.clientHeight - 18;
    if (isResizeHandle) {
      return;
    }
    state.drag = {
      kind,
      id,
      offsetX: event.offsetX,
      offsetY: event.offsetY,
    };
    return;
  }
}

function handleNodeClick(nodeId) {
  if (state.connectMode) {
    if (!state.connectSource) {
      state.connectSource = nodeId;
    } else if (state.connectSource !== nodeId) {
      addEdge(state.connectSource, nodeId);
      state.connectSource = null;
    }
    return;
  }
  selectNode(nodeId);
}

function selectNode(nodeId) {
  state.selectedNodeId = nodeId;
  const node = getNode(nodeId);
  if (!node) return;
  renderInspector(node);
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
}

function updateConnections() {
  connections.innerHTML = `
    <defs>
      <marker id="arrow" markerWidth="10" markerHeight="10" refX="10" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L9,3 z" fill="#4b7bec" />
      </marker>
    </defs>
  `;
  state.edges.forEach((edge) => {
    const source = getNode(edge.source);
    const target = getNode(edge.target);
    if (!source || !target) return;

    const sourceEl = getNodeElement(source.id);
    const targetEl = getNodeElement(target.id);
    if (!sourceEl || !targetEl) return;

    const sourceRect = sourceEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    const x1 = sourceRect.left - canvasRect.left + sourceRect.width / 2;
    const y1 = sourceRect.top - canvasRect.top + sourceRect.height / 2;
    const x2 = targetRect.left - canvasRect.left + targetRect.width / 2;
    const y2 = targetRect.top - canvasRect.top + targetRect.height / 2;

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
    connections.appendChild(path);
  });
}

function getNode(id) {
  return state.nodes.find((node) => node.id === id);
}

function getNodeElement(id) {
  return canvas.querySelector(`[data-node-id="${id}"]`);
}

function clearSelection() {
  state.selectedNodeId = null;
  inspector.innerHTML = "<p>Select a node to edit its parameters.</p>";
}

function resetCanvas() {
  state.nodes = [];
  state.edges = [];
  state.selectedNodeId = null;
  state.connectSource = null;
  state.connectDrag = null;
  state.nodeCounter = 1;
  canvas.querySelectorAll(".node").forEach((node) => node.remove());
  updateConnections();
  clearSelection();
  output.innerHTML = "<p>Run a simulation to see results.</p>";
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
  updateConnections();
  clearSelection();
}

function syncNodeSize(nodeId) {
  const node = getNode(nodeId);
  const el = getNodeElement(nodeId);
  if (!node || !el) return;
  node.width = el.offsetWidth;
  node.height = el.offsetHeight;
  updateConnections();
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
  const canvasRect = canvas.getBoundingClientRect();
  const source = {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  };
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("stroke", "#2563eb");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-dasharray", "4 4");
  connections.appendChild(path);
  state.connectDrag = {
    sourceId,
    path,
    source,
    canvasRect,
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
    const x = event.clientX - canvasRect.left - 40;
    const y = event.clientY - canvasRect.top - 20;
    createNode(type, x, y);
  });
}

canvas.addEventListener("mousemove", (event) => {
  if (state.connectDrag) {
    const { source, path, canvasRect } = state.connectDrag;
    const x2 = event.clientX - canvasRect.left;
    const y2 = event.clientY - canvasRect.top;
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
    node.x = event.clientX - canvasRect.left - state.drag.offsetX;
    node.y = event.clientY - canvasRect.top - state.drag.offsetY;
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
  state.drag = null;
});

canvas.addEventListener("mouseleave", () => {
  state.drag = null;
});

canvas.addEventListener("click", () => {
  if (!state.connectMode) {
    clearSelection();
  }
});

toggleConnect.addEventListener("click", () => {
  state.connectMode = !state.connectMode;
  state.connectSource = null;
  toggleConnect.textContent = `Connector mode: ${state.connectMode ? "On" : "Off"}`;
});

toggleLeftPanel.addEventListener("click", () => {
  layout.classList.toggle("left-collapsed");
});

function getNodeIdFromPoint(event) {
  const element = document.elementFromPoint(event.clientX, event.clientY);
  if (!element) return null;
  const nodeElement = element.closest(".node");
  if (!nodeElement) return null;
  return nodeElement.dataset.nodeId;
}

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
