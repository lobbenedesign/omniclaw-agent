/**
 * 🦄 OMNICLAW AGENT CLIENT SCRIPT
 * Manages WebSocket live stream, Mem0 graph interactions,
 * Smolagents code execution, and Browser-Use navigation.
 */

let ws = null;

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupWebSocket();
  fetchStatus();
  fetchMemoryGraph();
  setupAgentForm();
  setupCodeRunner();
  setupBrowserNavigator();
});

// Tab Switching
function setupTabs() {
  const tabs = document.querySelectorAll(".nav-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      const targetId = `tab-${tab.getAttribute("data-tab")}`;
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add("active");
    });
  });
}

// WebSocket Connection
function setupWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onopen = () => {
    document.getElementById("chip-ws-status").textContent = "🟢 WebSocket Live";
    document.getElementById("chip-ws-status").style.color = "#4ade80";
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleWebSocketEvent(data);
    } catch {}
  };

  ws.onclose = () => {
    document.getElementById("chip-ws-status").textContent = "🔴 Disconnected";
    document.getElementById("chip-ws-status").style.color = "#f87171";
    setTimeout(setupWebSocket, 3000);
  };
}

function handleWebSocketEvent(data) {
  if (data.type === "memory_updated" || data.type === "memory_deleted") {
    fetchMemoryGraph();
    fetchStatus();
  }
}

// Fetch System Status
async function fetchStatus() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    document.getElementById("chip-active-model").textContent = `⚡ ${data.activeModel}`;
    document.getElementById("chip-mem-count").textContent = `🧠 ${data.memoryNodesCount} Knowledge Nodes`;
    document.getElementById("chip-tasks-count").textContent = `🚀 ${data.totalTasksExecuted} Tasks Done`;
  } catch {}
}

// Agent Form & Execution Stream
function setupAgentForm() {
  const form = document.getElementById("form-agent-prompt");
  const input = document.getElementById("input-agent-prompt");
  const output = document.getElementById("agent-stream-output");
  const traceList = document.getElementById("agent-trace-list");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;

    // Append User Entry
    const userCard = document.createElement("div");
    userCard.style.cssText = "background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 6px; padding: 12px;";
    userCard.innerHTML = `<strong style="color: #c4b5fd;">❯ User Task:</strong> <span style="color: #fff;">${prompt}</span>`;
    output.appendChild(userCard);

    // Append Assistant Placeholder
    const assistantCard = document.createElement("div");
    assistantCard.style.cssText = "background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); border-radius: 6px; padding: 14px;";
    assistantCard.innerHTML = `<strong style="color: #38bdf8;">🦄 OmniClaw Autonomous Agent:</strong><div style="margin-top: 6px; color: var(--text-muted);">Thinking in executable code & recalling memory...</div>`;
    output.appendChild(assistantCard);
    output.scrollTop = output.scrollHeight;

    input.value = "";

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();

      assistantCard.innerHTML = `<strong style="color: #38bdf8;">🦄 OmniClaw Autonomous Agent:</strong><div style="margin-top: 8px; line-height: 1.5; white-space: pre-wrap;">${data.reply}</div>`;
      output.scrollTop = output.scrollHeight;

      if (data.trace && traceList) {
        traceList.innerHTML = data.trace.map((t, idx) => `
          <div class="trace-item">
            <div class="trace-badge">${idx + 1}</div>
            <div class="trace-content">
              <strong>${t.title}</strong>
              <p>${t.detail}</p>
            </div>
          </div>
        `).join("");
      }

      fetchStatus();
      fetchMemoryGraph();
    } catch (err) {
      assistantCard.innerHTML = `<strong style="color: #f87171;">❌ Execution Error:</strong> <div>${err.message}</div>`;
    }
  });

  // Enter to submit
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event("submit"));
    }
  });
}

// Mem0 Memory Graph
async function fetchMemoryGraph() {
  try {
    const res = await fetch("/api/memory");
    const graph = await res.json();

    const container = document.getElementById("memory-nodes-container");
    const workingCtxInput = document.getElementById("input-working-context");

    if (workingCtxInput) workingCtxInput.value = graph.workingContext || "";

    if (!container) return;
    container.innerHTML = "";

    if (!graph.nodes || graph.nodes.length === 0) {
      container.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); padding: 10px;">No memory nodes stored yet.</div>`;
      return;
    }

    graph.nodes.forEach(node => {
      const card = document.createElement("div");
      card.className = "memory-node-card";
      card.innerHTML = `
        <div class="memory-node-header">
          <span class="node-type-tag">${node.type}</span>
          <strong style="font-size: 12.5px; color: #fff;">${node.label}</strong>
          <button class="btn-icon" style="color: #f87171; font-size: 11px; cursor: pointer;" onclick="deleteNode('${node.id}')">✕</button>
        </div>
        <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">${node.content}</div>
        <div style="display: flex; gap: 4px; margin-top: 4px;">
          ${(node.tags || []).map(t => `<span class="pill" style="font-size: 9.5px;">#${t}</span>`).join("")}
        </div>
      `;
      container.appendChild(card);
    });
  } catch {}
}

window.deleteNode = async function(id) {
  if (!confirm("Delete this memory node?")) return;
  await fetch("/api/memory/node", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });
  fetchMemoryGraph();
  fetchStatus();
};

// Smolagents Code Runner
function setupCodeRunner() {
  const btnRun = document.getElementById("btn-run-code");
  const inputCode = document.getElementById("input-code-snippet");
  const selectLang = document.getElementById("select-code-lang");
  const outputTerm = document.getElementById("code-output-terminal");
  const telemetry = document.getElementById("code-exec-telemetry");

  btnRun.addEventListener("click", async () => {
    const code = inputCode.value.trim();
    const language = selectLang.value;
    if (!code) return;

    outputTerm.textContent = "⚡ Executing in sandbox...";
    try {
      const res = await fetch("/api/code/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language })
      });
      const data = await res.json();
      telemetry.textContent = `${data.executionTimeMs} ms • Exit: ${data.exitCode}`;
      outputTerm.textContent = data.stdout || data.stderr || "(Execution completed with zero output)";
      if (!data.success && data.stderr) {
        outputTerm.style.color = "#f87171";
      } else {
        outputTerm.style.color = "#38bdf8";
      }
    } catch (e) {
      outputTerm.textContent = "Error: " + e.message;
      outputTerm.style.color = "#f87171";
    }
  });
}

// Browser-Use Navigation
function setupBrowserNavigator() {
  const btnNav = document.getElementById("btn-browser-navigate");
  const inputUrl = document.getElementById("input-browser-url");
  const titleEl = document.getElementById("browser-page-title");
  const urlEl = document.getElementById("browser-current-url");
  const domContent = document.getElementById("browser-dom-content");

  btnNav.addEventListener("click", async () => {
    const queryOrUrl = inputUrl.value.trim();
    if (!queryOrUrl) return;

    domContent.textContent = "🌐 Navigating DOM and extracting visual structure...";
    try {
      const isUrl = queryOrUrl.startsWith("http://") || queryOrUrl.startsWith("https://") || queryOrUrl.includes(".");
      const payload = isUrl ? { url: queryOrUrl } : { query: queryOrUrl };

      const res = await fetch("/api/browser/navigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      titleEl.textContent = data.title || "Web Page";
      urlEl.textContent = data.url || queryOrUrl;
      domContent.textContent = data.extractedText || data.domSummary || data.error || "(No DOM text extracted)";
    } catch (e) {
      domContent.textContent = "Browser Navigation Error: " + e.message;
    }
  });
}
