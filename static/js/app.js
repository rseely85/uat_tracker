/* ================================================================
   UAT Tracker — app.js
   Pure vanilla JS, no external libraries.
   ================================================================ */

"use strict";

// ================================================================
// Utilities
// ================================================================

async function api(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Server error (${res.status})`);
  }
  if (!json.success) throw new Error(json.error || "API error");
  return json.data;
}

function toast(msg, type = "info") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove("hidden");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add("hidden"), 3000);
}

function trunc(str, n = 60) {
  if (!str) return "";
  return str.length > n ? str.slice(0, n) + "…" : str;
}

function statusIcon(result) {
  const map = { pass: "✓", fail: "✗", skip: "—", pending: "○" };
  return map[result] || "○";
}

function statusClass(result) {
  return `status-${result || "pending"}`;
}

function badgeHtml(val) {
  return `<span class="badge badge-${val}">${val}</span>`;
}

function formatDate(str) {
  if (!str) return "";
  try {
    return new Date(str).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch { return str; }
}

// ================================================================
// Global state
// ================================================================

const state = {
  allDropdowns: [],       // flat list of all dropdown_items
  testCases: [],          // current library list
  selectedCaseId: null,   // library selected row
  editMode: false,        // new vs edit

  groups: [],             // all test groups
  selectedGroupId: null,
  groupSelectedCaseId: null,

  activeRunId: null,
  activeRunResults: [],   // array of result objects
  selectedRunCaseId: null,

  historyRuns: [],
  expandedRunId: null,

  settingsLevel: 1,
};

// ================================================================
// Navigation
// ================================================================

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(s => s.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.getElementById(`tab-${tab}`).classList.add("active");
    if (tab === "library")  initLibrary();
    if (tab === "groups")   initGroups();
    if (tab === "run")      initRun();
    if (tab === "history")  initHistory();
    if (tab === "settings") initSettings();
  });
});

// ================================================================
// Dropdown data helpers
// ================================================================

async function loadAllDropdowns() {
  state.allDropdowns = await api("GET", "/api/dropdowns");
}

function ddItems(num, parentId) {
  return state.allDropdowns.filter(d => {
    if (d.dropdown_num !== num) return false;
    if (parentId === undefined || parentId === null || parentId === "") return true;
    return d.parent_item_id === parentId;
  }).sort((a, b) => (a.sort_order - b.sort_order) || (a.item_id - b.item_id));
}

function ddLabel(itemId) {
  if (!itemId) return "";
  const item = state.allDropdowns.find(d => d.item_id === itemId);
  return item ? item.value : "";
}

// Returns "value > parent_value > grandparent_value" path for settings parent pickers
function ddFullPath(itemId) {
  const parts = [];
  let id = itemId;
  while (id) {
    const item = state.allDropdowns.find(d => d.item_id === id);
    if (!item) break;
    parts.push(item.value);
    id = item.parent_item_id;
  }
  return parts.join(" > ");
}

function populateSelect(selectEl, items, selectedId, placeholder) {
  const prev = selectedId || (selectEl.value ? parseInt(selectEl.value) : null);
  selectEl.innerHTML = `<option value="">${placeholder || "— select —"}</option>`;
  items.forEach(item => {
    const opt = document.createElement("option");
    opt.value = item.item_id;
    opt.textContent = item.value;
    if (item.item_id === prev) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

function clearSelect(selectEl, placeholder) {
  selectEl.innerHTML = `<option value="">${placeholder || "— select —"}</option>`;
}

// ================================================================
// ================================================================
// TAB: LIBRARY
// ================================================================
// ================================================================

async function initLibrary() {
  await loadAllDropdowns();
  populateFilterBar();
  await loadAndRenderLibrary();
  populateDetailDropdowns();
  populateGroupDropdown();
}

// ---------- Filter bar ----------
// Filter bar starts fully populated — each field is independently selectable.
// Selecting a value cascades/narrows the fields to the right.
// Clearing a value resets fields to the right back to show all.
function populateFilterBar() {
  populateSelect(document.getElementById("flt-d1"), ddItems(1), null, "All Apps");
  populateSelect(document.getElementById("flt-d2"), ddItems(2), null, "All Groups");
  populateSelect(document.getElementById("flt-d3"), ddItems(3), null, "All Functions");
  populateSelect(document.getElementById("flt-d4"), ddItems(4), null, "All Sections");
  populateSelect(document.getElementById("flt-d5"), ddItems(5), null, "All Fields");
  populateSelect(document.getElementById("flt-d6"), ddItems(6), null, "All Func1");
  populateSelect(document.getElementById("flt-d7"), ddItems(7), null, "All Func2");
}

["flt-d1", "flt-d2", "flt-d3", "flt-d4", "flt-d5", "flt-d6", "flt-d7"].forEach(id => {
  document.getElementById(id).addEventListener("change", onFilterChange);
});

function onFilterChange(e) {
  const id = e.target.id;
  // When a value is chosen → narrow the field to the right by parent.
  // When cleared → reset the field to the right back to show all items.
  if (id === "flt-d1") {
    const d1Val = intOrNull(document.getElementById("flt-d1").value);
    populateSelect(document.getElementById("flt-d2"), d1Val ? ddItems(2, d1Val) : ddItems(2), null, "All Groups");
    populateSelect(document.getElementById("flt-d3"), ddItems(3), null, "All Functions");
    populateSelect(document.getElementById("flt-d4"), ddItems(4), null, "All Sections");
    populateSelect(document.getElementById("flt-d5"), ddItems(5), null, "All Fields");
    populateSelect(document.getElementById("flt-d6"), ddItems(6), null, "All Func1");
    populateSelect(document.getElementById("flt-d7"), ddItems(7), null, "All Func2");
  } else if (id === "flt-d2") {
    const d2Val = intOrNull(document.getElementById("flt-d2").value);
    populateSelect(document.getElementById("flt-d3"), d2Val ? ddItems(3, d2Val) : ddItems(3), null, "All Functions");
    populateSelect(document.getElementById("flt-d4"), ddItems(4), null, "All Sections");
    populateSelect(document.getElementById("flt-d5"), ddItems(5), null, "All Fields");
    populateSelect(document.getElementById("flt-d6"), ddItems(6), null, "All Func1");
    populateSelect(document.getElementById("flt-d7"), ddItems(7), null, "All Func2");
  } else if (id === "flt-d3") {
    const d3Val = intOrNull(document.getElementById("flt-d3").value);
    populateSelect(document.getElementById("flt-d4"), d3Val ? ddItems(4, d3Val) : ddItems(4), null, "All Sections");
    populateSelect(document.getElementById("flt-d5"), ddItems(5), null, "All Fields");
    populateSelect(document.getElementById("flt-d6"), ddItems(6), null, "All Func1");
    populateSelect(document.getElementById("flt-d7"), ddItems(7), null, "All Func2");
  } else if (id === "flt-d4") {
    const d4Val = intOrNull(document.getElementById("flt-d4").value);
    populateSelect(document.getElementById("flt-d5"), d4Val ? ddItems(5, d4Val) : ddItems(5), null, "All Fields");
    populateSelect(document.getElementById("flt-d6"), ddItems(6), null, "All Func1");
    populateSelect(document.getElementById("flt-d7"), ddItems(7), null, "All Func2");
  } else if (id === "flt-d5") {
    const d5Val = intOrNull(document.getElementById("flt-d5").value);
    populateSelect(document.getElementById("flt-d6"), d5Val ? ddItems(6, d5Val) : ddItems(6), null, "All Func1");
    populateSelect(document.getElementById("flt-d7"), ddItems(7), null, "All Func2");
  } else if (id === "flt-d6") {
    const d6Val = intOrNull(document.getElementById("flt-d6").value);
    populateSelect(document.getElementById("flt-d7"), d6Val ? ddItems(7, d6Val) : ddItems(7), null, "All Func2");
  }
  loadAndRenderLibrary();
}

document.getElementById("btn-clear-filter").addEventListener("click", () => {
  ["flt-d1","flt-d2","flt-d3","flt-d4","flt-d5","flt-d6","flt-d7"].forEach(id => {
    document.getElementById(id).value = "";
  });
  populateFilterBar();
  loadAndRenderLibrary();
});

function intOrNull(v) {
  const n = parseInt(v);
  return isNaN(n) ? null : n;
}

// ---------- Load and render ----------
async function loadAndRenderLibrary() {
  const params = new URLSearchParams();
  ["d1","d2","d3","d4","d5","d6","d7"].forEach((d, i) => {
    const v = document.getElementById(`flt-${d}`).value;
    if (v) params.set(d, v);
  });
  try {
    state.testCases = await api("GET", `/api/test-cases?${params.toString()}`);
  } catch (e) {
    toast(e.message, "error");
    return;
  }
  renderLibraryTable();
}

function renderLibraryTable() {
  const tbody = document.getElementById("library-tbody");
  tbody.innerHTML = "";
  if (!state.testCases.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted" style="padding:20px">No test cases found</td></tr>';
    return;
  }
  state.testCases.forEach(tc => {
    const tr = document.createElement("tr");
    if (tc.case_id === state.selectedCaseId) tr.classList.add("selected");
    tr.dataset.caseId = tc.case_id;
    tr.innerHTML = `
      <td>${tc.d1_label || ""}</td>
      <td>${tc.d2_label || ""}</td>
      <td>${tc.d3_label || ""}</td>
      <td>${tc.d4_label || ""}</td>
      <td>${tc.d5_label || ""}</td>
      <td>${tc.d6_label || ""}</td>
      <td>${tc.d7_label || ""}</td>
      <td title="${(tc.task||"").replace(/"/g,"&quot;")}">${trunc(tc.task, 55)}</td>
      <td class="actions-cell">
        <button class="btn btn-ghost btn-sm btn-edit-case" data-id="${tc.case_id}">Edit</button>
      </td>
    `;
    tr.addEventListener("click", (e) => {
      if (e.target.classList.contains("btn-edit-case")) return;
      selectLibraryRow(tc.case_id);
    });
    tr.querySelector(".btn-edit-case").addEventListener("click", () => {
      openDetailPanel(tc.case_id);
    });
    tbody.appendChild(tr);
  });
}

function selectLibraryRow(caseId) {
  state.selectedCaseId = caseId;
  document.querySelectorAll("#library-tbody tr").forEach(tr => {
    tr.classList.toggle("selected", parseInt(tr.dataset.caseId) === caseId);
  });
  openDetailPanel(caseId);
}

// ---------- Detail panel ----------
function populateDetailDropdowns(caseData) {
  const d1 = caseData ? caseData.d1_id : null;
  const d2 = caseData ? caseData.d2_id : null;
  const d3 = caseData ? caseData.d3_id : null;
  const d4 = caseData ? caseData.d4_id : null;
  const d5 = caseData ? caseData.d5_id : null;
  const d6 = caseData ? caseData.d6_id : null;
  const d7 = caseData ? caseData.d7_id : null;

  populateSelect(document.getElementById("det-d1"), ddItems(1), d1);
  populateSelect(document.getElementById("det-d2"), d1 ? ddItems(2, d1) : [], d2);
  populateSelect(document.getElementById("det-d3"), d2 ? ddItems(3, d2) : [], d3);
  populateSelect(document.getElementById("det-d4"), d3 ? ddItems(4, d3) : [], d4);
  populateSelect(document.getElementById("det-d5"), d4 ? ddItems(5, d4) : [], d5);
  populateSelect(document.getElementById("det-d6"), d5 ? ddItems(6, d5) : [], d6);
  populateSelect(document.getElementById("det-d7"), d6 ? ddItems(7, d6) : [], d7);
}

// Cascade in detail panel — full chain d1→d2→d3→d4→d5→d6→d7
["det-d1","det-d2","det-d3","det-d4","det-d5","det-d6"].forEach(id => {
  document.getElementById(id).addEventListener("change", onDetailDropdownChange);
});

function onDetailDropdownChange(e) {
  const id = e.target.id;
  const val = intOrNull(e.target.value);
  if (id === "det-d1") {
    populateSelect(document.getElementById("det-d2"), val ? ddItems(2, val) : []);
    clearSelect(document.getElementById("det-d3"));
    clearSelect(document.getElementById("det-d4"));
    clearSelect(document.getElementById("det-d5"));
    clearSelect(document.getElementById("det-d6"));
    clearSelect(document.getElementById("det-d7"));
  } else if (id === "det-d2") {
    populateSelect(document.getElementById("det-d3"), val ? ddItems(3, val) : []);
    clearSelect(document.getElementById("det-d4"));
    clearSelect(document.getElementById("det-d5"));
    clearSelect(document.getElementById("det-d6"));
    clearSelect(document.getElementById("det-d7"));
  } else if (id === "det-d3") {
    populateSelect(document.getElementById("det-d4"), val ? ddItems(4, val) : []);
    clearSelect(document.getElementById("det-d5"));
    clearSelect(document.getElementById("det-d6"));
    clearSelect(document.getElementById("det-d7"));
  } else if (id === "det-d4") {
    populateSelect(document.getElementById("det-d5"), val ? ddItems(5, val) : []);
    clearSelect(document.getElementById("det-d6"));
    clearSelect(document.getElementById("det-d7"));
  } else if (id === "det-d5") {
    populateSelect(document.getElementById("det-d6"), val ? ddItems(6, val) : []);
    clearSelect(document.getElementById("det-d7"));
  } else if (id === "det-d6") {
    populateSelect(document.getElementById("det-d7"), val ? ddItems(7, val) : []);
  }
}

async function openDetailPanel(caseId) {
  state.selectedCaseId = caseId;
  state.editMode = true;
  document.getElementById("detail-title").textContent = "Edit Test Case";
  document.getElementById("btn-delete-case").classList.remove("hidden");

  const tc = state.testCases.find(c => c.case_id === caseId);
  if (!tc) return;

  populateDetailDropdowns(tc);
  document.getElementById("det-task").value  = tc.task  || "";
  document.getElementById("det-notes").value = tc.notes || "";
}

function switchToNewMode() {
  state.selectedCaseId = null;
  state.editMode = false;
  document.querySelectorAll("#library-tbody tr").forEach(tr => tr.classList.remove("selected"));
  document.getElementById("detail-title").textContent = "New Test Case";
  document.getElementById("btn-delete-case").classList.add("hidden");
}

document.getElementById("btn-new-test").addEventListener("click", () => {
  switchToNewMode();
  populateDetailDropdowns(null);
  document.getElementById("det-task").value  = "";
  document.getElementById("det-notes").value = "";
});

// Cancel: switch to new-test mode but KEEP field values so user can tweak and save again
document.getElementById("btn-cancel-case").addEventListener("click", () => {
  switchToNewMode();
});

document.getElementById("btn-save-case").addEventListener("click", async () => {
  const body = {
    d1_id: intOrNull(document.getElementById("det-d1").value),
    d2_id: intOrNull(document.getElementById("det-d2").value),
    d3_id: intOrNull(document.getElementById("det-d3").value),
    d4_id: intOrNull(document.getElementById("det-d4").value),
    d5_id: intOrNull(document.getElementById("det-d5").value),
    d6_id: intOrNull(document.getElementById("det-d6").value),
    d7_id: intOrNull(document.getElementById("det-d7").value),
    task:  document.getElementById("det-task").value.trim(),
    notes: document.getElementById("det-notes").value.trim(),
  };
  try {
    if (state.editMode && state.selectedCaseId) {
      await api("PUT", `/api/test-cases/${state.selectedCaseId}`, body);
      toast("Test case updated", "success");
    } else {
      const created = await api("POST", "/api/test-cases", body);
      state.selectedCaseId = created.case_id;
      state.editMode = true;
      toast("Test case created", "success");
    }
    await loadAndRenderLibrary();
  } catch (e) {
    toast(e.message, "error");
  }
});

document.getElementById("btn-delete-case").addEventListener("click", async () => {
  if (!state.selectedCaseId) return;
  if (!confirm("Delete this test case? It will also be removed from any groups.")) return;
  try {
    await api("DELETE", `/api/test-cases/${state.selectedCaseId}`);
    toast("Deleted", "success");
    switchToNewMode();
    await loadAndRenderLibrary();
  } catch (e) {
    toast(e.message, "error");
  }
});

// ---------- Add to group ----------
async function populateGroupDropdown() {
  try {
    state.groups = await api("GET", "/api/test-groups");
  } catch { return; }
  const sel = document.getElementById("det-add-group");
  sel.innerHTML = '<option value="">Add to Group…</option>';
  state.groups.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g.group_id;
    opt.textContent = g.group_name;
    sel.appendChild(opt);
  });
}

document.getElementById("btn-add-to-group").addEventListener("click", async () => {
  const groupId = intOrNull(document.getElementById("det-add-group").value);
  if (!groupId) { toast("Select a group first"); return; }
  if (!state.selectedCaseId) { toast("Save the test case first"); return; }
  try {
    await api("POST", `/api/test-groups/${groupId}/cases`, { case_id: state.selectedCaseId });
    toast("Added to group", "success");
    document.getElementById("det-add-group").value = "";
  } catch (e) {
    toast(e.message, "error");
  }
});

// ================================================================
// ================================================================
// TAB: GROUPS
// ================================================================
// ================================================================

async function initGroups() {
  await loadAllDropdowns();
  await loadGroups();
}

async function loadGroups() {
  try {
    state.groups = await api("GET", "/api/test-groups");
  } catch (e) {
    toast(e.message, "error");
    return;
  }
  renderGroupList();
  if (state.selectedGroupId) {
    await loadGroupDetail(state.selectedGroupId);
  }
}

function renderGroupList() {
  const ul = document.getElementById("group-list");
  ul.innerHTML = "";
  state.groups.forEach(g => {
    const li = document.createElement("li");
    li.className = "item-list-row" + (g.group_id === state.selectedGroupId ? " active" : "");
    li.textContent = g.group_name;
    li.dataset.groupId = g.group_id;
    li.addEventListener("click", () => {
      state.selectedGroupId = g.group_id;
      renderGroupList();
      loadGroupDetail(g.group_id);
    });
    ul.appendChild(li);
  });
}

async function loadGroupDetail(groupId) {
  let groupData;
  try {
    groupData = await api("GET", `/api/test-groups/${groupId}`);
  } catch (e) {
    toast(e.message, "error");
    return;
  }
  document.getElementById("group-detail-empty").classList.add("hidden");
  document.getElementById("group-detail-content").classList.remove("hidden");
  document.getElementById("grp-name").value = groupData.group_name;
  document.getElementById("grp-desc").value = groupData.description || "";
  renderGroupCases(groupData.cases || []);
  state.groupSelectedCaseId = null;
}

function renderGroupCases(cases) {
  const tbody = document.getElementById("group-cases-tbody");
  tbody.innerHTML = "";
  if (!cases.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:16px">No test cases yet</td></tr>';
    return;
  }
  cases.forEach(tc => {
    const tr = document.createElement("tr");
    tr.dataset.caseId = tc.case_id;
    if (tc.case_id === state.groupSelectedCaseId) tr.classList.add("selected");
    tr.innerHTML = `
      <td><input type="checkbox" class="group-case-check" data-id="${tc.case_id}" /></td>
      <td>${tc.d1_label || ""}</td>
      <td>${tc.d3_label || ""}</td>
      <td>${tc.d4_label || ""}</td>
      <td>${tc.d5_label || ""}</td>
      <td>${tc.d6_label || ""}</td>
      <td title="${(tc.task||"").replace(/"/g,"&quot;")}">${trunc(tc.task, 50)}</td>
    `;
    tr.addEventListener("click", (e) => {
      if (e.target.type === "checkbox") return;
      document.querySelectorAll("#group-cases-tbody tr").forEach(r => r.classList.remove("selected"));
      tr.classList.add("selected");
      const cb = tr.querySelector("input[type=checkbox]");
      if (cb) cb.checked = true;
      state.groupSelectedCaseId = tc.case_id;
    });
    tbody.appendChild(tr);
  });
}

// New group
document.getElementById("btn-new-group").addEventListener("click", async () => {
  const name = prompt("Group name:");
  if (!name || !name.trim()) return;
  try {
    const g = await api("POST", "/api/test-groups", { group_name: name.trim() });
    toast("Group created", "success");
    state.selectedGroupId = g.group_id;
    await loadGroups();
    loadGroupDetail(g.group_id);
  } catch (e) {
    toast(e.message, "error");
  }
});

// Save group changes
document.getElementById("btn-save-group").addEventListener("click", async () => {
  if (!state.selectedGroupId) return;
  try {
    await api("PUT", `/api/test-groups/${state.selectedGroupId}`, {
      group_name:  document.getElementById("grp-name").value.trim(),
      description: document.getElementById("grp-desc").value.trim(),
    });
    toast("Group saved", "success");
    await loadGroups();
  } catch (e) {
    toast(e.message, "error");
  }
});

// Remove selected case from group
document.getElementById("btn-remove-case-from-group").addEventListener("click", async () => {
  if (!state.selectedGroupId) return;
  // collect checked
  const checked = [...document.querySelectorAll(".group-case-check:checked")].map(cb => parseInt(cb.dataset.id));
  if (!checked.length) { toast("Select a case to remove"); return; }
  try {
    for (const caseId of checked) {
      await api("DELETE", `/api/test-groups/${state.selectedGroupId}/cases/${caseId}`);
    }
    toast("Removed", "success");
    loadGroupDetail(state.selectedGroupId);
  } catch (e) {
    toast(e.message, "error");
  }
});

// Start run from groups tab
document.getElementById("btn-start-run-from-group").addEventListener("click", async () => {
  if (!state.selectedGroupId) return;
  await startRunForGroup(state.selectedGroupId);
  // Switch to run tab
  document.querySelector('[data-tab="run"]').click();
});

// ---------- Case Picker Modal ----------
document.getElementById("btn-open-case-picker").addEventListener("click", async () => {
  await loadAllDropdowns();
  populatePickerFilters();
  await loadPickerCases();
  document.getElementById("case-picker-modal").classList.remove("hidden");
});

document.getElementById("btn-close-picker").addEventListener("click", () => {
  document.getElementById("case-picker-modal").classList.add("hidden");
});
document.getElementById("btn-cancel-picker").addEventListener("click", () => {
  document.getElementById("case-picker-modal").classList.add("hidden");
});

function populatePickerFilters() {
  populateSelect(document.getElementById("pflt-d1"), ddItems(1), null, "All Apps");
  populateSelect(document.getElementById("pflt-d3"), ddItems(3), null, "All Menus");
  clearSelect(document.getElementById("pflt-d4"), "All Sections");
}

document.getElementById("pflt-d3").addEventListener("change", () => {
  const d3 = intOrNull(document.getElementById("pflt-d3").value);
  populateSelect(document.getElementById("pflt-d4"), d3 ? ddItems(4, d3) : [], null, "All Sections");
  loadPickerCases();
});
["pflt-d1","pflt-d4"].forEach(id => {
  document.getElementById(id).addEventListener("change", () => loadPickerCases());
});
document.getElementById("btn-picker-clear").addEventListener("click", () => {
  document.getElementById("pflt-d1").value = "";
  document.getElementById("pflt-d3").value = "";
  clearSelect(document.getElementById("pflt-d4"), "All Sections");
  loadPickerCases();
});

// Select-all checkbox in picker
document.getElementById("picker-select-all").addEventListener("change", function () {
  document.querySelectorAll(".picker-check:not(:disabled)").forEach(cb => {
    cb.checked = this.checked;
  });
});

function syncPickerSelectAll() {
  const all      = document.querySelectorAll(".picker-check:not(:disabled)");
  const checked  = document.querySelectorAll(".picker-check:not(:disabled):checked");
  const selAll   = document.getElementById("picker-select-all");
  selAll.indeterminate = checked.length > 0 && checked.length < all.length;
  selAll.checked = all.length > 0 && checked.length === all.length;
}

async function loadPickerCases() {
  const params = new URLSearchParams();
  const d1 = document.getElementById("pflt-d1").value;
  const d3 = document.getElementById("pflt-d3").value;
  const d4 = document.getElementById("pflt-d4").value;
  if (d1) params.set("d1", d1);
  if (d3) params.set("d3", d3);
  if (d4) params.set("d4", d4);
  let cases;
  try {
    cases = await api("GET", `/api/test-cases?${params.toString()}`);
  } catch { return; }

  // Get cases already in group to mark them
  let inGroup = new Set();
  if (state.selectedGroupId) {
    try {
      const g = await api("GET", `/api/test-groups/${state.selectedGroupId}`);
      (g.cases || []).forEach(c => inGroup.add(c.case_id));
    } catch { /**/ }
  }

  const tbody = document.getElementById("picker-tbody");
  tbody.innerHTML = "";
  cases.forEach(tc => {
    const tr = document.createElement("tr");
    const already = inGroup.has(tc.case_id);
    tr.innerHTML = `
      <td><input type="checkbox" class="picker-check" data-id="${tc.case_id}" ${already ? "checked disabled" : ""} /></td>
      <td>${tc.d1_label || ""}</td>
      <td>${tc.d3_label || ""}</td>
      <td>${tc.d4_label || ""}</td>
      <td>${tc.d5_label || ""}</td>
      <td title="${(tc.task||"").replace(/"/g,"&quot;")}">${trunc(tc.task, 50)}</td>
    `;
    if (already) tr.style.opacity = "0.5";
    tbody.appendChild(tr);
  });

  // Reset select-all state after list rebuilds
  document.getElementById("picker-select-all").checked = false;
  document.getElementById("picker-select-all").indeterminate = false;

  // Keep select-all in sync when individual rows are toggled
  tbody.addEventListener("change", e => {
    if (e.target.classList.contains("picker-check")) syncPickerSelectAll();
  });
}

document.getElementById("btn-confirm-add-cases").addEventListener("click", async () => {
  if (!state.selectedGroupId) { toast("No group selected"); return; }
  const checked = [...document.querySelectorAll(".picker-check:checked:not(:disabled)")].map(cb => parseInt(cb.dataset.id));
  if (!checked.length) { toast("No cases selected"); return; }
  let added = 0;
  for (const caseId of checked) {
    try {
      await api("POST", `/api/test-groups/${state.selectedGroupId}/cases`, { case_id: caseId });
      added++;
    } catch { /**/ }
  }
  toast(`${added} case(s) added`, "success");
  document.getElementById("case-picker-modal").classList.add("hidden");
  loadGroupDetail(state.selectedGroupId);
});

// ================================================================
// ================================================================
// TAB: RUN
// ================================================================
// ================================================================

async function initRun() {
  await loadAllDropdowns();
  // Populate group selector
  try {
    state.groups = await api("GET", "/api/test-groups");
  } catch { return; }
  const sel = document.getElementById("run-group-select");
  const prev = sel.value;
  sel.innerHTML = '<option value="">Select a Group…</option>';
  state.groups.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g.group_id;
    opt.textContent = g.group_name;
    if (g.group_id === parseInt(prev)) opt.selected = true;
    sel.appendChild(opt);
  });

  // Restore active run if any
  if (state.activeRunId) {
    await renderActiveRun(state.activeRunId);
  }
}

document.getElementById("btn-start-run").addEventListener("click", async () => {
  const groupId = intOrNull(document.getElementById("run-group-select").value);
  if (!groupId) { toast("Select a group first"); return; }
  await startRunForGroup(groupId);
});

async function startRunForGroup(groupId) {
  try {
    const run = await api("POST", "/api/test-runs", { group_id: groupId });
    state.activeRunId = run.run_id;
    document.getElementById("run-group-select").value = groupId;
    await renderActiveRun(run.run_id);
    toast("Run started", "success");
  } catch (e) {
    toast(e.message, "error");
  }
}

async function renderActiveRun(runId) {
  let runData;
  try {
    runData = await api("GET", `/api/test-runs/${runId}`);
  } catch (e) {
    toast(e.message, "error");
    return;
  }

  state.activeRunResults = runData.results || [];
  state.activeRunId = runId;

  document.getElementById("run-active-panel").classList.remove("hidden");
  document.getElementById("run-name-input").value = runData.run_name || "";
  document.getElementById("run-date-display").textContent = formatDate(runData.run_date);

  updateRunProgress();
  renderRunCaseList();

  // Auto-select first pending
  const firstPending = state.activeRunResults.find(r => r.result === "pending");
  if (firstPending) {
    selectRunCase(firstPending.case_id);
  }
}

function updateRunProgress() {
  const results = state.activeRunResults;
  const total = results.length;
  const done  = results.filter(r => r.result !== "pending").length;
  const pct   = total ? Math.round((done / total) * 100) : 0;
  document.getElementById("run-progress-fill").style.width = `${pct}%`;
  document.getElementById("run-progress-label").textContent = `${done} / ${total} complete (${pct}%)`;
}

function renderRunCaseList() {
  const tbody = document.getElementById("run-case-tbody");
  tbody.innerHTML = "";
  state.activeRunResults.forEach(r => {
    const tr = document.createElement("tr");
    tr.dataset.caseId = r.case_id;
    if (r.case_id === state.selectedRunCaseId) tr.classList.add("selected");
    tr.innerHTML = `
      <td class="status-cell ${statusClass(r.result)}">${statusIcon(r.result)}</td>
      <td>${r.d1_label || ""}</td>
      <td>${r.d3_label || ""}</td>
      <td>${r.d4_label || ""}</td>
      <td title="${(r.task||"").replace(/"/g,"&quot;")}">${trunc(r.task, 55)}</td>
    `;
    tr.addEventListener("click", () => selectRunCase(r.case_id));
    tbody.appendChild(tr);
  });
}

function selectRunCase(caseId) {
  state.selectedRunCaseId = caseId;
  document.querySelectorAll("#run-case-tbody tr").forEach(tr => {
    tr.classList.toggle("selected", parseInt(tr.dataset.caseId) === caseId);
  });
  const r = state.activeRunResults.find(r => r.case_id === caseId);
  if (!r) return;
  document.getElementById("run-task-text").textContent  = r.task  || "(no task defined)";
  document.getElementById("run-case-notes").textContent = r.case_notes || "";
  document.getElementById("run-result-notes").value     = r.result_notes || "";
  document.getElementById("run-detail-panel").classList.remove("hidden");
}

async function submitRunResult(result) {
  if (!state.activeRunId || !state.selectedRunCaseId) return;
  const notes = document.getElementById("run-result-notes").value.trim();
  try {
    await api("POST", `/api/test-runs/${state.activeRunId}/results/${state.selectedRunCaseId}`, {
      result,
      result_notes: notes,
    });
    // Update local state
    const idx = state.activeRunResults.findIndex(r => r.case_id === state.selectedRunCaseId);
    if (idx !== -1) {
      state.activeRunResults[idx].result       = result;
      state.activeRunResults[idx].result_notes = notes;
    }
    updateRunProgress();
    renderRunCaseList();
    // Move to next pending
    const next = state.activeRunResults.find(r => r.result === "pending");
    if (next) {
      selectRunCase(next.case_id);
    } else {
      document.getElementById("run-detail-panel").classList.add("hidden");
      toast("All cases complete!", "success");
    }
  } catch (e) {
    toast(e.message, "error");
  }
}

document.getElementById("btn-pass").addEventListener("click", () => submitRunResult("pass"));
document.getElementById("btn-fail").addEventListener("click", () => submitRunResult("fail"));
document.getElementById("btn-skip").addEventListener("click", () => submitRunResult("skip"));

document.getElementById("btn-save-run-progress").addEventListener("click", () => {
  toast("Progress saved (auto-saved on each result)", "success");
});

document.getElementById("btn-complete-run").addEventListener("click", async () => {
  if (!state.activeRunId) return;
  if (!confirm("Mark this run as complete?")) return;
  try {
    await api("PUT", `/api/test-runs/${state.activeRunId}/complete`);
    toast("Run marked complete", "success");
    state.activeRunId = null;
    document.getElementById("run-active-panel").classList.add("hidden");
    document.getElementById("run-detail-panel").classList.add("hidden");
  } catch (e) {
    toast(e.message, "error");
  }
});

// Auto-save run name on blur
document.getElementById("run-name-input").addEventListener("blur", async () => {
  if (!state.activeRunId) return;
  try {
    await api("PUT", `/api/test-runs/${state.activeRunId}`, {
      run_name: document.getElementById("run-name-input").value.trim(),
    });
  } catch { /**/ }
});

// ================================================================
// ================================================================
// TAB: HISTORY
// ================================================================
// ================================================================

async function initHistory() {
  try {
    state.groups = await api("GET", "/api/test-groups");
  } catch { /**/ }
  const grpSel = document.getElementById("hist-group-filter");
  const prev = grpSel.value;
  grpSel.innerHTML = '<option value="">All Groups</option>';
  state.groups.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g.group_id;
    opt.textContent = g.group_name;
    if (g.group_id === parseInt(prev)) opt.selected = true;
    grpSel.appendChild(opt);
  });

  await loadHistory();
}

async function loadHistory() {
  try {
    state.historyRuns = await api("GET", "/api/test-runs");
  } catch (e) {
    toast(e.message, "error");
    return;
  }
  renderHistoryTable();
}

document.getElementById("hist-group-filter").addEventListener("change", renderHistoryTable);
document.getElementById("hist-status-filter").addEventListener("change", renderHistoryTable);

function renderHistoryTable() {
  const groupFilter  = document.getElementById("hist-group-filter").value;
  const statusFilter = document.getElementById("hist-status-filter").value;

  let runs = state.historyRuns;
  if (groupFilter)  runs = runs.filter(r => r.group_id === parseInt(groupFilter));
  if (statusFilter) runs = runs.filter(r => r.status === statusFilter);

  const tbody = document.getElementById("history-tbody");
  tbody.innerHTML = "";

  if (!runs.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted" style="padding:20px">No runs found</td></tr>';
    return;
  }

  runs.forEach(run => {
    const pct = run.total ? Math.round((run.pass_count / run.total) * 100) : 0;
    const tr = document.createElement("tr");
    tr.dataset.runId = run.run_id;
    tr.innerHTML = `
      <td>${formatDate(run.run_date)}</td>
      <td>${run.group_name || ""}</td>
      <td>${run.run_name || ""}</td>
      <td class="status-pass">${run.pass_count || 0}</td>
      <td class="status-fail">${run.fail_count || 0}</td>
      <td class="status-skip">${run.skip_count || 0}</td>
      <td class="status-pending">${run.pending_count || 0}</td>
      <td>${run.total || 0}</td>
      <td>${pct}%</td>
      <td>${badgeHtml(run.status)}</td>
    `;
    tr.addEventListener("click", () => toggleHistoryExpand(run.run_id, tr));
    tbody.appendChild(tr);

    // If currently expanded, re-expand
    if (run.run_id === state.expandedRunId) {
      renderHistoryExpand(run.run_id, tr);
    }
  });
}

async function toggleHistoryExpand(runId, tr) {
  // Remove any existing expand rows
  const existing = document.querySelector(".history-expand-row");
  if (existing) existing.remove();

  if (state.expandedRunId === runId) {
    state.expandedRunId = null;
    return;
  }
  state.expandedRunId = runId;
  await renderHistoryExpand(runId, tr);
}

async function renderHistoryExpand(runId, tr) {
  let runData;
  try {
    runData = await api("GET", `/api/test-runs/${runId}`);
  } catch { return; }

  const expandTr = document.createElement("tr");
  expandTr.className = "history-expand-row";
  expandTr.innerHTML = `<td colspan="10" class="history-expand-row"><div class="history-expand-inner"></div></td>`;

  const inner = expandTr.querySelector(".history-expand-inner");
  const results = runData.results || [];

  const table = document.createElement("table");
  table.className = "history-expand-table";
  table.innerHTML = `
    <thead>
      <tr><th>App</th><th>Menu</th><th>Section</th><th>Task</th><th>Result</th><th>Notes</th><th>Completed</th></tr>
    </thead>
  `;
  const etbody = document.createElement("tbody");
  results.forEach(r => {
    const etr = document.createElement("tr");
    etr.innerHTML = `
      <td>${r.d1_label || ""}</td>
      <td>${r.d3_label || ""}</td>
      <td>${r.d4_label || ""}</td>
      <td>${trunc(r.task, 60)}</td>
      <td>${badgeHtml(r.result || "pending")}</td>
      <td>${r.result_notes || ""}</td>
      <td>${r.completed_at ? formatDate(r.completed_at) : ""}</td>
    `;
    etbody.appendChild(etr);
  });
  table.appendChild(etbody);
  inner.appendChild(table);
  tr.after(expandTr);
}

// Export buttons
document.getElementById("btn-export-selected-run").addEventListener("click", () => {
  if (!state.expandedRunId) { toast("Click a run row first to select it"); return; }
  window.location.href = `/api/export/excel/${state.expandedRunId}`;
});

document.getElementById("btn-export-all-runs").addEventListener("click", () => {
  window.location.href = "/api/export/excel/all";
});

document.getElementById("btn-print-history").addEventListener("click", () => {
  window.print();
});

// ================================================================
// ================================================================
// TAB: SETTINGS
// ================================================================
// ================================================================

const LEVEL_NAMES = [
  "", "Application", "Testing Group", "Function Group",
  "Section", "Field / Button", "Function 1", "Function 2",
];

async function initSettings() {
  await loadAllDropdowns();
  renderSettingsLevelItems(state.settingsLevel);
}

document.querySelectorAll(".settings-level-list .item-list-row").forEach(li => {
  li.addEventListener("click", () => {
    document.querySelectorAll(".settings-level-list .item-list-row").forEach(r => r.classList.remove("active"));
    li.classList.add("active");
    state.settingsLevel = parseInt(li.dataset.level);
    renderSettingsLevelItems(state.settingsLevel);
    document.getElementById("settings-add-form").classList.add("hidden");
  });
});

function renderSettingsLevelItems(level) {
  document.getElementById("settings-level-title").textContent = `Dropdown ${level}: ${LEVEL_NAMES[level]}`;

  const items = ddItems(level, undefined);
  const tbody = document.getElementById("settings-items-tbody");
  tbody.innerHTML = "";

  items.forEach(item => {
    const parentLabel = item.parent_item_id ? ddFullPath(item.parent_item_id) : "—";
    const tr = document.createElement("tr");
    tr.dataset.itemId = item.item_id;
    tr.innerHTML = `
      <td class="edit-cell-value">${item.value}</td>
      <td class="edit-cell-parent">${parentLabel}</td>
      <td class="edit-cell-order">${item.sort_order}</td>
      <td class="actions-cell">
        <button class="btn btn-ghost btn-sm btn-edit-dd" data-id="${item.item_id}">Edit</button>
        <button class="btn btn-danger btn-sm btn-del-dd" data-id="${item.item_id}">Delete</button>
      </td>
    `;
    tr.querySelector(".btn-edit-dd").addEventListener("click", () => openInlineEdit(tr, item));
    tr.querySelector(".btn-del-dd").addEventListener("click", () => deleteDropdownItem(item.item_id));
    tbody.appendChild(tr);
  });
}

function openInlineEdit(tr, item) {
  // Close any open inline edits first
  document.querySelectorAll(".settings-table tr.editing").forEach(r => {
    if (r !== tr) { r.classList.remove("editing"); }
  });
  if (tr.classList.contains("editing")) return;
  tr.classList.add("editing");

  const id = item.item_id;

  // Value cell → text input
  const valueCell = tr.querySelector(".edit-cell-value");
  valueCell.innerHTML = `<input type="text" class="form-input" id="inline-value-${id}" value="${item.value.replace(/"/g,"&quot;")}" style="width:100%;min-width:80px" />`;

  // Parent cell → select (populated from level above, hidden for level 1)
  const parentCell = tr.querySelector(".edit-cell-parent");
  if (state.settingsLevel > 1) {
    const parentItems = ddItems(state.settingsLevel - 1, undefined);
    let opts = '<option value="">— none —</option>';
    parentItems.forEach(p => {
      const sel = p.item_id === item.parent_item_id ? " selected" : "";
      opts += `<option value="${p.item_id}"${sel}>${ddFullPath(p.item_id)}</option>`;
    });
    parentCell.innerHTML = `<select class="form-select" id="inline-parent-${id}" style="width:100%;min-width:80px">${opts}</select>`;
  } else {
    parentCell.innerHTML = "—";
  }

  // Order cell → number input
  const orderCell = tr.querySelector(".edit-cell-order");
  orderCell.innerHTML = `<input type="number" class="form-input" id="inline-order-${id}" value="${item.sort_order}" style="width:60px" />`;

  // Actions cell → Save | Delete | Cancel  (Save left of where Edit was, Cancel right of Delete)
  const actionsCell = tr.querySelector(".actions-cell");
  actionsCell.innerHTML = `
    <button class="btn btn-primary btn-sm" id="btn-inline-save-${id}">Save</button>
    <button class="btn btn-danger btn-sm" id="btn-inline-del-${id}">Delete</button>
    <button class="btn btn-ghost btn-sm" id="btn-inline-cancel-${id}">Cancel</button>
  `;

  document.getElementById(`btn-inline-save-${id}`).addEventListener("click", async () => {
    const newVal    = document.getElementById(`inline-value-${id}`).value.trim();
    const newOrder  = parseInt(document.getElementById(`inline-order-${id}`).value) || 0;
    const parentEl  = document.getElementById(`inline-parent-${id}`);
    const newParent = parentEl ? intOrNull(parentEl.value) : item.parent_item_id;
    if (!newVal) { toast("Value cannot be empty"); return; }
    try {
      await api("PUT", `/api/dropdowns/${id}`, { value: newVal, sort_order: newOrder, parent_item_id: newParent });
      await loadAllDropdowns();
      renderSettingsLevelItems(state.settingsLevel);
      toast("Updated", "success");
    } catch (e) {
      toast(e.message, "error");
    }
  });

  document.getElementById(`btn-inline-del-${id}`).addEventListener("click", () => {
    deleteDropdownItem(id);
  });

  document.getElementById(`btn-inline-cancel-${id}`).addEventListener("click", () => {
    renderSettingsLevelItems(state.settingsLevel);
  });
}

async function deleteDropdownItem(itemId) {
  if (!confirm("Delete this item? Any test cases using it will lose this value.")) return;
  try {
    await api("DELETE", `/api/dropdowns/${itemId}`);
    await loadAllDropdowns();
    renderSettingsLevelItems(state.settingsLevel);
    toast("Deleted", "success");
  } catch (e) {
    toast(e.message, "error");
  }
}

// Add item button / form
document.getElementById("btn-add-dd-item").addEventListener("click", () => {
  const form = document.getElementById("settings-add-form");
  form.classList.remove("hidden");

  // Populate datalist with unique existing values for this level
  const datalist = document.getElementById("settings-value-suggestions");
  datalist.innerHTML = "";
  const uniqueVals = [...new Set(ddItems(state.settingsLevel).map(i => i.value))].sort();
  uniqueVals.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    datalist.appendChild(opt);
  });

  // Populate parent selector (level N-1 items)
  const parentGroup = document.getElementById("settings-parent-group");
  const parentSel   = document.getElementById("settings-new-parent");
  if (state.settingsLevel > 1) {
    parentGroup.style.display = "";
    const parentItems = ddItems(state.settingsLevel - 1, undefined);
    parentSel.innerHTML = '<option value="">— none —</option>';
    parentItems.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.item_id;
      opt.textContent = ddFullPath(p.item_id);
      parentSel.appendChild(opt);
    });
  } else {
    parentGroup.style.display = "none";
  }

  const inp = document.getElementById("settings-new-value");
  inp.value = "";
  document.getElementById("settings-value-hint").textContent = "";
  document.getElementById("settings-value-hint").className = "value-hint";
  inp.focus();
});

document.getElementById("btn-cancel-dd-item").addEventListener("click", () => {
  document.getElementById("settings-add-form").classList.add("hidden");
  document.getElementById("settings-value-hint").textContent = "";
  document.getElementById("settings-value-hint").className = "value-hint";
});

// Hint: tells user whether they're picking an existing value or adding a new one
document.getElementById("settings-new-value").addEventListener("input", () => {
  const val  = document.getElementById("settings-new-value").value.trim();
  const hint = document.getElementById("settings-value-hint");
  if (!val) {
    hint.textContent = "";
    hint.className   = "value-hint";
    return;
  }
  const exists = ddItems(state.settingsLevel).some(
    i => i.value.toLowerCase() === val.toLowerCase()
  );
  if (exists) {
    hint.textContent = "✓ Existing value — will be linked to the chosen parent";
    hint.className   = "value-hint hint-exists";
  } else {
    hint.textContent = "⚠ New value — will be added to the list";
    hint.className   = "value-hint hint-new";
  }
});

document.getElementById("btn-save-dd-item").addEventListener("click", async () => {
  const value = document.getElementById("settings-new-value").value.trim();
  if (!value) { toast("Enter a value"); return; }
  const parentId = intOrNull(document.getElementById("settings-new-parent").value);
  try {
    await api("POST", "/api/dropdowns", {
      dropdown_num:   state.settingsLevel,
      value,
      parent_item_id: parentId,
    });
    await loadAllDropdowns();
    renderSettingsLevelItems(state.settingsLevel);
    document.getElementById("settings-add-form").classList.add("hidden");
    toast("Item added", "success");
  } catch (e) {
    toast(e.message, "error");
  }
});

// ================================================================
// Init on load
// ================================================================
(async function bootstrap() {
  await loadAllDropdowns();
  await initLibrary();
})();
