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
const modePracticeBtn = document.getElementById("mode-practice");
const modeLearnBtn = document.getElementById("mode-learn");
const presetPicker = document.getElementById("preset-picker");
const presetSelect = document.getElementById("preset-select");
const learnControls = document.getElementById("learn-controls");
const canvasToolbar = document.getElementById("canvas-toolbar");
const evolutionToggle = document.getElementById("evolution-toggle");
const stagePicker = document.getElementById("stage-picker");
const stageSelect = document.getElementById("stage-select");
const validationPanel = document.getElementById("validation-panel");
const rightPanelTitle = document.getElementById("right-panel-title");
const rightPanelTabs = document.getElementById("right-panel-tabs");
const panelTabSimulate = document.getElementById("panel-tab-simulate");
const panelTabFaq = document.getElementById("panel-tab-faq");
const simulateView = document.getElementById("simulate-view");
const faqView = document.getElementById("faq-view");
const faqContent = document.getElementById("faq-content");

const STORAGE_KEY = "shield-canvas-state";

const state = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeIndex: null,
  clipboard: null,
  lastSimulation: null,
  connectDrag: null,
  edgeDrag: null,
  drag: null,
  pendingDrag: null,
  dragThreshold: 6,
  nodeCounter: 1,
  panX: 0,
  panY: 0,
  zoom: 1,
  pan: null,
  mode: "practice",
  activePreset: null,
  activePresetData: null,
  evolutionMode: false,
  activeStage: null,
  validationTimer: null,
  lastValidation: null,
  validationActive: false,
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
    mode: state.mode,
    activePreset: state.activePreset,
    evolutionMode: state.evolutionMode,
    activeStage: state.activeStage,
    outputHtml: output.innerHTML,
    lastSimulation: state.lastSimulation,
    validationActive: state.validationActive,
  };
}

function restoreState(snapshot) {
  state.nodes = snapshot.nodes.map((node) => ({ ...node, config: { ...node.config } }));
  state.edges = snapshot.edges.map((edge) => ({ ...edge }));
  state.nodeCounter = snapshot.nodeCounter;
  state.panX = snapshot.panX ?? 0;
  state.panY = snapshot.panY ?? 0;
  state.zoom = snapshot.zoom ?? 1;
  state.mode = snapshot.mode || "practice";
  state.activePreset = snapshot.activePreset || null;
  state.evolutionMode = snapshot.evolutionMode || false;
  state.activeStage = snapshot.activeStage || null;
  state.validationActive = snapshot.validationActive ?? false;
  state.selectedNodeId = null;
  state.selectedEdgeIndex = null;
  state.lastSimulation = snapshot.lastSimulation ?? null;
  canvasContent.querySelectorAll(".node").forEach((node) => node.remove());
  state.nodes.forEach((node) => renderNode(node));
  applyViewportTransform();
  clearSelection();
  applyModeUI();
  if (presetSelect) {
    presetSelect.value = state.activePreset || "";
  }
  if (snapshot.outputHtml) {
    output.innerHTML = snapshot.outputHtml;
  }
  if (state.lastSimulation?.performance?.bottleneck_component_ids) {
    applyBottleneckHighlight(state.lastSimulation.performance.bottleneck_component_ids);
  }
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
    scheduleValidation();
  } catch (error) {
    console.warn("Failed to load SHIELD state", error);
  }
}

function pushHistory() {
  state.history.past.push(snapshotState());
  state.history.future = [];
  saveState();
  scheduleValidation();
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
  RateLimiter: { name: "Rate Limiter", capacity: 1000, base_latency: 8 },
  CDN: { name: "CDN", capacity: 5000, base_latency: 4 },
  IDGenerator: { name: "ID Generator", capacity: 2000, base_latency: 12 },
  APIGateway: { name: "API Gateway", capacity: 4000, base_latency: 10 },
  Edge: { name: "Edge", capacity: 4000, base_latency: 6 },
  MatchingEngine: { name: "Matching Engine", capacity: 3500, base_latency: 22 },
  LocationService: { name: "Location Service", capacity: 3500, base_latency: 18 },
  TripService: { name: "Trip Service", capacity: 3200, base_latency: 24 },
  TransactionService: { name: "Transaction Service", capacity: 3000, base_latency: 20 },
  MLInferenceService: { name: "ML Inference", capacity: 2500, base_latency: 28 },
  RuleEngine: { name: "Rule Engine", capacity: 2800, base_latency: 16 },
  FeatureStore: { name: "Feature Store", capacity: 3000, base_latency: 14 },
  EventStream: { name: "Event Stream", capacity: 5000, base_latency: 12 },
  NotificationService: { name: "Notification Service", capacity: 2000, base_latency: 15 },
  InventoryService: { name: "Inventory Service", capacity: 2600, base_latency: 18 },
  PaymentGateway: { name: "Payment Gateway", capacity: 2200, base_latency: 20 },
  InventoryLocking: { name: "Inventory Locking", capacity: 1800, base_latency: 12 },
  SearchIndex: { name: "Search Index", capacity: 3000, base_latency: 12 },
  TokenBucket: { name: "Token Bucket", capacity: 3500, base_latency: 8 },
  DistributedSync: { name: "Distributed Sync", capacity: 2000, base_latency: 14 },
  Gateway: { name: "Gateway", capacity: 3500, base_latency: 10 },
  ChatServer: { name: "Chat Server", capacity: 3500, base_latency: 18 },
  MessageStore: { name: "Message Store", capacity: 3000, base_latency: 20 },
  MediaStore: { name: "Media Store", capacity: 2500, base_latency: 22 },
  Server: { name: "Server", capacity: 500, base_latency: 50 },
  Database: { name: "Database", capacity: 300, base_latency: 80 },
  Cache: { name: "Cache", capacity: 1200, base_latency: 5 },
  Queue: { name: "Message Queue", capacity: 600, base_latency: 30 },
  Worker: { name: "Worker", capacity: 800, base_latency: 25 },
};

const TYPE_ALIASES = {
  user: "User",
  loadbalancer: "LoadBalancer",
  load_balancer: "LoadBalancer",
  ratelimiter: "RateLimiter",
  rate_limiter: "RateLimiter",
  cdn: "CDN",
  idgenerator: "IDGenerator",
  id_generator: "IDGenerator",
  apigateway: "APIGateway",
  api_gateway: "APIGateway",
  edge: "Edge",
  matchingengine: "MatchingEngine",
  locationservice: "LocationService",
  tripservice: "TripService",
  transactionservice: "TransactionService",
  mlinferenceservice: "MLInferenceService",
  mlservice: "MLInferenceService",
  ruleengine: "RuleEngine",
  featurestore: "FeatureStore",
  eventstream: "EventStream",
  eventqueue: "EventStream",
  notificationservice: "NotificationService",
  inventoryservice: "InventoryService",
  paymentgateway: "PaymentGateway",
  inventorylocking: "InventoryLocking",
  inventorylockinglayer: "InventoryLocking",
  searchindex: "SearchIndex",
  tokenbucket: "TokenBucket",
  distributedsync: "DistributedSync",
  gateway: "Gateway",
  chatserver: "ChatServer",
  messagestore: "MessageStore",
  mediastore: "MediaStore",
  server: "Server",
  database: "Database",
  cache: "Cache",
  queue: "Queue",
  worker: "Worker",
};

function normalizeType(type) {
  if (!type) return "Server";
  const trimmed = String(type).trim();
  const key = trimmed.toLowerCase().replace(/\s+/g, "").replace(/-/g, "_");
  return TYPE_ALIASES[key] || trimmed;
}

function applyModeUI() {
  if (modePracticeBtn && modeLearnBtn) {
    modePracticeBtn.classList.toggle("active", state.mode === "practice");
    modeLearnBtn.classList.toggle("active", state.mode === "learn");
  }
  if (presetPicker) {
    presetPicker.classList.toggle("hidden", state.mode !== "learn");
  }
  if (learnControls) {
    learnControls.classList.toggle("hidden", state.mode !== "learn");
  }
  if (canvasToolbar) {
    canvasToolbar.classList.toggle("hidden", state.mode !== "learn");
  }
  if (rightPanelTitle) {
    rightPanelTitle.classList.toggle("hidden", state.mode === "learn");
  }
  if (rightPanelTabs) {
    rightPanelTabs.classList.toggle("hidden", state.mode !== "learn");
  }
  if (state.mode === "practice") {
    setPanelTab("simulate");
  }
  updateEvolutionUI();
}

function updateEvolutionUI() {
  if (evolutionToggle) {
    evolutionToggle.classList.toggle("active", state.evolutionMode);
    evolutionToggle.setAttribute("aria-pressed", state.evolutionMode ? "true" : "false");
    evolutionToggle.textContent = `Evolution: ${state.evolutionMode ? "On" : "Off"}`;
  }
  if (stagePicker) {
    stagePicker.classList.toggle(
      "hidden",
      state.mode !== "learn" || !state.evolutionMode || !state.activePresetData?.stages?.length
    );
  }
}

function renderFaqs(faqs = []) {
  if (!faqContent) return;
  if (!faqs.length) {
    faqContent.innerHTML = "<p>No FAQs available for this design.</p>";
    return;
  }
  faqContent.innerHTML = faqs
    .map(
      (item) => `
      <div class="faq-item">
        <h4>${item.question || "Question"}</h4>
        <p>${item.answer || ""}</p>
        ${item.topics?.length ? `<div class="faq-topics">${item.topics
          .map((topic) => `<span class="faq-topic">${topic}</span>`)
          .join("")}</div>` : ""}
      </div>
    `
    )
    .join("");
}

function populateStages(stages = []) {
  if (!stageSelect) return;
  stageSelect.innerHTML = "";
  stages.forEach((stage) => {
    const option = document.createElement("option");
    option.value = String(stage.stage ?? stage.title ?? "stage");
    option.textContent = `Stage ${stage.stage ?? ""}: ${stage.title || ""}`.trim();
    stageSelect.appendChild(option);
  });
  if (state.activeStage) {
    stageSelect.value = state.activeStage;
  }
}

function setPanelTab(tab) {
  if (state.mode !== "learn" && tab === "faq") {
    tab = "simulate";
  }
  const isFaq = tab === "faq";
  if (panelTabSimulate) {
    panelTabSimulate.classList.toggle("active", !isFaq);
  }
  if (panelTabFaq) {
    panelTabFaq.classList.toggle("active", isFaq);
  }
  if (simulateView) {
    simulateView.classList.toggle("hidden", isFaq);
  }
  if (faqView) {
    faqView.classList.toggle("hidden", !isFaq);
  }
}

function setMode(nextMode, { clearOnPractice = true } = {}) {
  if (state.mode === nextMode) return;
  state.mode = nextMode;
  if (nextMode === "practice") {
    state.activePreset = null;
    state.activePresetData = null;
    state.activeStage = null;
    state.evolutionMode = false;
    state.validationActive = false;
    if (presetSelect) {
      presetSelect.value = "";
    }
    if (clearOnPractice) {
      resetCanvas();
    }
    renderFaqs([]);
  }
  applyModeUI();
  saveState();
}

function setEvolutionMode(enabled) {
  state.evolutionMode = enabled;
  updateEvolutionUI();
  const stages = state.activePresetData?.stages || [];
  if (!stages.length) return;
  if (enabled) {
    if (!state.activeStage) {
      const lastStage = stages[stages.length - 1];
      state.activeStage = String(lastStage.stage ?? lastStage.title ?? "stage");
    }
    selectStage(state.activeStage);
  } else {
    const lastStage = stages[stages.length - 1];
    state.activeStage = String(lastStage.stage ?? lastStage.title ?? "stage");
    replaceGraph(lastStage.graph || {}, state.activePresetData?.traffic || {}, state.activePreset);
  }
  saveState();
}

function selectStage(stageValue) {
  const stages = state.activePresetData?.stages || [];
  if (!stages.length) return;
  const stage = stages.find((item) => String(item.stage ?? item.title) === String(stageValue)) || stages[0];
  state.activeStage = String(stage.stage ?? stage.title ?? "stage");
  replaceGraph(stage.graph || {}, state.activePresetData?.traffic || {}, state.activePreset);
  if (stageSelect) {
    stageSelect.value = state.activeStage;
  }
  saveState();
}

async function validateGraph() {
  const payload = buildGraphPayload();
  try {
    const response = await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    state.lastValidation = data;
    updateValidationUI(data);
  } catch (error) {
    console.warn("Validation failed", error);
  }
}

function scheduleValidation() {
  if (!validationPanel || !state.validationActive) return;
  if (state.validationTimer) {
    clearTimeout(state.validationTimer);
  }
  state.validationTimer = setTimeout(() => {
    validateGraph();
  }, 200);
}

function updateValidationUI(result) {
  if (!validationPanel || !simulateBtn) return;
  const errors = result?.errors || [];
  const valid = result?.valid !== false && errors.length === 0;
  if (!state.validationActive) {
    validationPanel.classList.add("hidden");
    validationPanel.innerHTML = "";
    simulateBtn.disabled = false;
    return;
  }
  simulateBtn.disabled = !valid;
  if (valid) {
    validationPanel.classList.add("hidden");
    validationPanel.innerHTML = "";
    return;
  }
  validationPanel.classList.remove("hidden");
  validationPanel.innerHTML = `
    <strong>Validation errors</strong>
    <ul>${errors.map((error) => `<li>${error}</li>`).join("")}</ul>
  `;
}

function buildPresetConfig(node, traffic) {
  const type = normalizeType(node.type);
  const baseConfig = { ...(defaults[type] || {}) };
  const directConfig = node.config ? { ...node.config } : {};
  const extra = { ...node };
  delete extra.id;
  delete extra.type;
  delete extra.position;
  delete extra.config;
  const merged = { ...baseConfig, ...extra, ...directConfig };
  if (type === "User") {
    if (traffic?.users !== undefined) {
      merged.number_of_users = Number(traffic.users);
    }
    if (traffic?.requests_per_user !== undefined) {
      merged.requests_per_user = Number(traffic.requests_per_user);
    }
  }
  if (!merged.name) {
    merged.name = baseConfig.name || type;
  }
  return { type, config: merged };
}

function replaceGraph(graph, traffic, presetName = null) {
  state.nodes = [];
  state.edges = [];
  state.selectedNodeId = null;
  state.selectedEdgeIndex = null;
  state.connectSource = null;
  state.connectDrag = null;
  state.panX = 0;
  state.panY = 0;
  state.zoom = 1;
  state.lastSimulation = null;
  state.validationActive = false;
  state.activePreset = presetName;
  applyViewportTransform();
  canvasContent.querySelectorAll(".node").forEach((node) => node.remove());

  const nodes = graph?.nodes || [];
  nodes.forEach((node) => {
    const { type, config } = buildPresetConfig(node, traffic);
    const position = node.position || {};
    const x = Number(position.x ?? node.x ?? 120);
    const y = Number(position.y ?? node.y ?? 120);
    const width = Number(node.width ?? 80);
    const height = Number(node.height ?? 40);
    const payload = {
      id: node.id || `${type}-${state.nodeCounter++}`,
      type,
      config,
      x,
      y,
      width,
      height,
    };
    state.nodes.push(payload);
    renderNode(payload);
  });

  const edges = graph?.edges || [];
  edges.forEach((edge) => {
    if (!edge?.source || !edge?.target) return;
    state.edges.push({ source: edge.source, target: edge.target });
  });

  state.nodeCounter = Math.max(state.nodes.length + 1, state.nodeCounter);
  updateConnections();
  clearSelection();
  applyBottleneckHighlight([]);
  output.innerHTML = "<p>Run a simulation to see results.</p>";
  pushHistory();
}

async function loadPreset(presetName) {
  if (!presetName) return;
  try {
    const response = await fetch(`/api/presets/${presetName}`);
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      output.innerHTML = `<p>${errorPayload.error || "Preset not found."}</p>`;
      return;
    }
    const data = await response.json();
    state.activePresetData = data;
    state.activePreset = presetName;
    const stages = (data.stages || []).slice().sort((a, b) => (a.stage ?? 0) - (b.stage ?? 0));
    state.activePresetData.stages = stages;
    populateStages(stages);
    renderFaqs(data.faqs || []);
    if (stages.length) {
      const lastStage = stages[stages.length - 1];
      state.activeStage = String(lastStage.stage ?? lastStage.title ?? "stage");
      if (state.evolutionMode) {
        selectStage(state.activeStage);
      } else {
        replaceGraph(lastStage.graph || {}, data.traffic || {}, presetName);
      }
    } else {
      replaceGraph(data.graph || {}, data.traffic || {}, presetName);
    }
    updateEvolutionUI();
  } catch (error) {
    output.innerHTML = "<p>Failed to load preset. Please try again.</p>";
    console.error("Failed to load preset", error);
  }
}

async function fetchPresetList() {
  if (!presetSelect) return;
  try {
    const response = await fetch("/api/presets");
    const data = await response.json();
    const presets = data.presets || [];
    presetSelect.innerHTML = "<option value=\"\">Select preset…</option>";
    presets.forEach((preset) => {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.name || preset.id;
      presetSelect.appendChild(option);
    });
    if (state.activePreset) {
      presetSelect.value = state.activePreset;
    }
  } catch (error) {
    console.warn("Failed to load presets", error);
  }
}

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
    state.pendingDrag = {
      kind,
      id,
      startClientX: event.clientX,
      startClientY: event.clientY,
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
        if (state.lastSimulation) {
          renderSimulationResult(state.lastSimulation);
          saveState();
        }
        return;
      }
      node.config[key] = Number(event.target.value);
      scheduleValidation();
      saveState();
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

function applyBottleneckHighlight(bottleneckIds) {
  canvasContent.querySelectorAll(".node").forEach((nodeEl) => {
    nodeEl.classList.remove("bottleneck");
  });
  bottleneckIds.forEach((nodeId) => {
    const nodeEl = getNodeElement(nodeId);
    if (nodeEl) {
      nodeEl.classList.add("bottleneck");
    }
  });
}

function getNodeDisplayName(nodeId) {
  const node = getNode(nodeId);
  if (!node) return null;
  return node.config?.name || node.type || node.id;
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
  state.lastSimulation = null;
  state.validationActive = false;
  applyViewportTransform();
  canvasContent.querySelectorAll(".node").forEach((node) => node.remove());
  updateConnections();
  clearSelection();
  applyBottleneckHighlight([]);
  output.innerHTML = "<p>Run a simulation to see results.</p>";
  if (validationPanel) {
    validationPanel.classList.add("hidden");
    validationPanel.innerHTML = "";
  }
  if (simulateBtn) {
    simulateBtn.disabled = false;
  }
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

function cloneGraphPayload() {
  const nodes = state.nodes.map((node) => ({ ...node, config: { ...node.config } }));
  const edges = state.edges.map((edge) => ({ ...edge }));
  return { nodes, edges };
}

function cloneSelectedNode() {
  const node = getNode(state.selectedNodeId);
  if (!node) return null;
  return {
    nodes: [{ ...node, config: { ...node.config } }],
    edges: [],
  };
}

function setClipboard(payload) {
  state.clipboard = payload;
}

function pasteClipboard() {
  if (!state.clipboard) return;
  const { nodes, edges } = state.clipboard;
  if (!nodes.length) return;
  const idMap = new Map();
  const offset = 30;

  const newNodes = nodes.map((node) => {
    const newId = `${node.type}-${state.nodeCounter++}`;
    idMap.set(node.id, newId);
    const clone = {
      ...node,
      id: newId,
      x: node.x + offset,
      y: node.y + offset,
      config: { ...node.config },
    };
    state.nodes.push(clone);
    renderNode(clone);
    return clone;
  });

  edges.forEach((edge) => {
    const source = idMap.get(edge.source);
    const target = idMap.get(edge.target);
    if (!source || !target) return;
    state.edges.push({ source, target });
  });

  updateConnections();
  selectNode(newNodes[newNodes.length - 1].id);
  pushHistory();
}

function handleSimulationResult(result) {
  state.lastSimulation = result;
  renderSimulationResult(result);
  saveState();
}

function renderSimulationResult(result) {
  const warnings = result.architectural_warnings || [];
  const structural = result.structural_errors || [];
  const performance = result.performance || {};
  const nodeMetrics = result.node_metrics || [];
  const recommendations = result.recommendations || [];
  const bottleneckIds = performance.bottleneck_component_ids || [];
  const bottleneckComponents = performance.bottleneck_components || [];
  const bottleneckLabels = bottleneckIds
    .map((nodeId) => getNodeDisplayName(nodeId))
    .filter(Boolean);

  applyBottleneckHighlight(bottleneckIds);

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
        <li>Bottleneck: ${bottleneckLabels.length ? bottleneckLabels.join(", ") : (bottleneckComponents.length ? bottleneckComponents.join(", ") : (performance.bottleneck_component ?? "N/A"))}</li>
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
  state.pendingDrag = null;
  state.drag = null;
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
  if (state.pendingDrag && !state.drag && !state.connectDrag) {
    const dx = event.clientX - state.pendingDrag.startClientX;
    const dy = event.clientY - state.pendingDrag.startClientY;
    if (Math.hypot(dx, dy) >= state.dragThreshold) {
      const node = getNode(state.pendingDrag.id);
      if (node) {
        const canvasRect = canvas.getBoundingClientRect();
        const pointerX = (event.clientX - canvasRect.left - state.panX) / state.zoom;
        const pointerY = (event.clientY - canvasRect.top - state.panY) / state.zoom;
        state.drag = {
          kind: state.pendingDrag.kind,
          id: state.pendingDrag.id,
          offsetX: pointerX - node.x,
          offsetY: pointerY - node.y,
        };
      }
      state.pendingDrag = null;
    }
  }
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
  state.pendingDrag = null;
  state.pan = null;
  state.edgeDrag = null;
});

canvas.addEventListener("mouseleave", () => {
  state.drag = null;
  state.pendingDrag = null;
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

  if (event.key.toLowerCase() === "c") {
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
    event.preventDefault();
    const payload = state.selectedNodeId ? cloneSelectedNode() : cloneGraphPayload();
    setClipboard(payload);
  }

  if (event.key.toLowerCase() === "v") {
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
    event.preventDefault();
    pasteClipboard();
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

if (modePracticeBtn) {
  modePracticeBtn.addEventListener("click", () => setMode("practice"));
}

if (modeLearnBtn) {
  modeLearnBtn.addEventListener("click", () => setMode("learn", { clearOnPractice: false }));
}

if (presetSelect) {
  presetSelect.addEventListener("change", (event) => {
    const value = event.target.value;
    if (value) {
      loadPreset(value);
    }
  });
}

if (evolutionToggle) {
  evolutionToggle.addEventListener("click", () => {
    setEvolutionMode(!state.evolutionMode);
  });
}

if (stageSelect) {
  stageSelect.addEventListener("change", (event) => {
    selectStage(event.target.value);
  });
}

if (panelTabSimulate) {
  panelTabSimulate.addEventListener("click", () => setPanelTab("simulate"));
}

if (panelTabFaq) {
  panelTabFaq.addEventListener("click", () => setPanelTab("faq"));
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
  if (!state.validationActive) {
    state.validationActive = true;
  }
  await validateGraph();
  if (state.lastValidation && state.lastValidation.valid === false) {
    return;
  }
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

applyModeUI();

setPanelTab("simulate");

fetchPresetList();

loadState();

scheduleValidation();
