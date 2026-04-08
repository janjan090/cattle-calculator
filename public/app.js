const STORAGE_KEYS = {
  users: "cattleflow_users",
  session: "cattleflow_session",
  projections: "cattleflow_projections"
};

const DEFAULT_INPUTS = {
  title: "",
  dietMode: "8020",
  acquisitionCost: 45000,
  entryWeight: 300,
  finalWeight: 420,
  sellingPrice: 180,
  dryMatterPercent: 35,
  silagePrice: 4,
  concentratePrice: 35,
  caretakerSalary: 3000
};

const state = {
  user: readStorage(STORAGE_KEYS.session, null),
  users: readStorage(STORAGE_KEYS.users, []),
  projections: readStorage(STORAGE_KEYS.projections, []),
  preview: null
};

const authView = document.getElementById("authView");
const dashboardView = document.getElementById("dashboardView");
const authMessage = document.getElementById("authMessage");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const projectionForm = document.getElementById("projectionForm");
const savedList = document.getElementById("savedList");
const resultHint = document.getElementById("resultHint");
const advisoryCard = document.getElementById("advisoryCard");
const welcomeName = document.getElementById("welcomeName");
const sessionEmail = document.getElementById("sessionEmail");

const metricNodes = {
  silage: document.getElementById("metricSilage"),
  concentrate: document.getElementById("metricConcentrate"),
  feedCost: document.getElementById("metricFeedCost"),
  adg: document.getElementById("metricAdg"),
  gross: document.getElementById("metricGross"),
  net: document.getElementById("metricNet"),
  roi: document.getElementById("metricRoi"),
  expenses: document.getElementById("metricExpenses"),
  breakeven: document.getElementById("metricBreakeven"),
  silageCost: document.getElementById("metricSilageCost"),
  concentrateCost: document.getElementById("metricConcentrateCost"),
  feedMixBar: document.getElementById("feedMixBar"),
  feedMixLabel: document.getElementById("feedMixLabel")
};

document.querySelectorAll("[data-auth-tab]").forEach((button) => {
  button.addEventListener("click", () => switchAuthTab(button.dataset.authTab));
});

document.querySelectorAll('input[name="dietMode"]').forEach((input) => {
  input.addEventListener("change", () => {
    syncDietFields();
    refreshPreview();
  });
});

projectionForm.querySelectorAll("input").forEach((input) => {
  input.addEventListener("input", refreshPreview);
});

loginForm.addEventListener("submit", onLogin);
registerForm.addEventListener("submit", onRegister);
projectionForm.addEventListener("submit", onSaveProjection);
document.getElementById("resetProjectionButton").addEventListener("click", resetProjectionForm);
document.getElementById("logoutButton").addEventListener("click", logout);
document.getElementById("demoFillButton").addEventListener("click", loadDemoData);

boot();

function boot() {
  applyDefaults();
  syncDietFields();
  refreshPreview();

  if (!state.user) {
    renderAuth();
    return;
  }

  renderDashboard();
}

function switchAuthTab(tab) {
  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authTab === tab);
  });
  loginForm.classList.toggle("hidden", tab !== "login");
  registerForm.classList.toggle("hidden", tab !== "register");
  authMessage.textContent = "";
}

function syncDietFields() {
  const mode = new FormData(projectionForm).get("dietMode");
  document.querySelectorAll(".conditional-field").forEach((field) => {
    field.classList.toggle("hidden", field.dataset.mode !== mode);
  });
}

function onLogin(event) {
  event.preventDefault();
  const payload = formToObject(new FormData(loginForm));
  const email = payload.email.trim().toLowerCase();
  const password = payload.password;
  const user = state.users.find((entry) => entry.email === email && entry.password === password);

  if (!user) {
    authMessage.textContent = "Invalid email or password.";
    return;
  }

  state.user = { id: user.id, name: user.name, email: user.email };
  writeStorage(STORAGE_KEYS.session, state.user);
  authMessage.textContent = "";
  renderDashboard();
}

function onRegister(event) {
  event.preventDefault();
  const payload = formToObject(new FormData(registerForm));
  const name = payload.name.trim();
  const email = payload.email.trim().toLowerCase();
  const password = payload.password;

  if (!name || !email || password.length < 8) {
    authMessage.textContent = "Use a valid name, email, and password with at least 8 characters.";
    return;
  }

  if (state.users.some((entry) => entry.email === email)) {
    authMessage.textContent = "That email is already registered on this browser.";
    return;
  }

  const user = {
    id: cryptoRandomId(),
    name,
    email,
    password
  };

  state.users.push(user);
  writeStorage(STORAGE_KEYS.users, state.users);
  state.user = { id: user.id, name: user.name, email: user.email };
  writeStorage(STORAGE_KEYS.session, state.user);
  authMessage.textContent = "";
  renderDashboard();
}

function onSaveProjection(event) {
  event.preventDefault();

  try {
    const projection = createProjectionFromForm();
    state.projections.unshift(projection);
    writeStorage(STORAGE_KEYS.projections, state.projections);
    applyProjection(projection);
    renderSavedList();
    resultHint.textContent = `${projection.title} saved to this browser.`;
  } catch (error) {
    resultHint.textContent = error.message;
  }
}

function renderAuth() {
  authView.classList.remove("hidden");
  dashboardView.classList.add("hidden");
}

function renderDashboard() {
  authView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  welcomeName.textContent = `Welcome, ${state.user.name}`;
  sessionEmail.textContent = state.user.email;
  refreshPreview();
  renderSavedList();
}

function renderSavedList() {
  const userProjections = getUserProjections();

  if (userProjections.length === 0) {
    savedList.innerHTML = '<p class="empty-state">No saved projections yet. Build one and save it to start comparing batches.</p>';
    return;
  }

  savedList.innerHTML = userProjections.map((projection) => `
    <article class="saved-card">
      <header>
        <div>
          <h3>${escapeHtml(projection.title)}</h3>
          <p>${formatDate(projection.createdAt)} | ${projection.inputs.dietMode === "8020" ? "80/20 strategy" : "100% silage"}</p>
        </div>
        <button class="link-button" type="button" data-load-id="${projection.id}">Load</button>
      </header>
      <div class="saved-metrics">
        <div><span>Net income</span><strong>${formatCurrency(projection.outputs.netIncome)}</strong></div>
        <div><span>Feed cost</span><strong>${formatCurrency(projection.outputs.totalFeedCost)}</strong></div>
        <div><span>Break-even</span><strong>${formatCurrency(projection.outputs.breakEvenPrice)}/kg</strong></div>
      </div>
      <div class="saved-actions">
        <p>${escapeHtml(projection.advisory)}</p>
        <button class="link-button danger" type="button" data-delete-id="${projection.id}">Delete</button>
      </div>
    </article>
  `).join("");

  savedList.querySelectorAll("[data-load-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const projection = userProjections.find((entry) => entry.id === button.dataset.loadId);
      if (!projection) {
        return;
      }
      hydrateProjectionForm(projection.inputs, projection.title);
      applyProjection(projection);
      resultHint.textContent = `${projection.title} loaded from saved scenarios.`;
    });
  });

  savedList.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.projections = state.projections.filter((entry) => entry.id !== button.dataset.deleteId);
      writeStorage(STORAGE_KEYS.projections, state.projections);
      renderSavedList();
    });
  });
}

function refreshPreview() {
  try {
    state.preview = buildCalculation(readInputsFromForm());
    applyMetrics(state.preview);
  } catch (error) {
    resetMetrics();
    resultHint.textContent = error.message;
  }
}

function createProjectionFromForm() {
  if (!state.user) {
    throw new Error("Please sign in first.");
  }

  const raw = readInputsFromForm();
  const title = raw.title.trim();
  if (!title) {
    throw new Error("Please provide a projection name.");
  }

  const calculation = buildCalculation(raw);
  return {
    id: cryptoRandomId(),
    userId: state.user.id,
    title,
    createdAt: new Date().toISOString(),
    inputs: calculation.inputs,
    outputs: calculation.outputs,
    advisory: calculation.advisory
  };
}

function buildCalculation(raw) {
  const inputs = {
    title: raw.title || "",
    dietMode: raw.dietMode === "100" ? "100" : "8020",
    acquisitionCost: toNumber(raw.acquisitionCost),
    entryWeight: toNumber(raw.entryWeight),
    finalWeight: toNumber(raw.finalWeight),
    sellingPrice: toNumber(raw.sellingPrice),
    dryMatterPercent: toNumber(raw.dryMatterPercent),
    silagePrice: toNumber(raw.silagePrice),
    concentratePrice: raw.dietMode === "100" ? 0 : toNumber(raw.concentratePrice),
    caretakerSalary: toNumber(raw.caretakerSalary)
  };

  const numericFields = [
    "acquisitionCost",
    "entryWeight",
    "finalWeight",
    "sellingPrice",
    "dryMatterPercent",
    "silagePrice",
    "caretakerSalary"
  ];

  if (inputs.dietMode === "8020") {
    numericFields.push("concentratePrice");
  }

  for (const field of numericFields) {
    if (!Number.isFinite(inputs[field]) || inputs[field] < 0) {
      throw new Error("All numeric fields must contain valid non-negative values.");
    }
  }

  if (inputs.finalWeight <= inputs.entryWeight) {
    throw new Error("Final weight must be higher than entry weight.");
  }

  if (inputs.dryMatterPercent <= 0) {
    throw new Error("Dry matter must be greater than zero.");
  }

  const days = 100;
  const dmi = 0.025;
  const averageDailyGain = (inputs.finalWeight - inputs.entryWeight) / days;
  const averageBodyWeight = (inputs.entryWeight + inputs.finalWeight) / 2;
  const totalDryMatter = averageBodyWeight * dmi * days;
  const asFedTotal = totalDryMatter / (inputs.dryMatterPercent / 100);

  const silageRatio = inputs.dietMode === "8020" ? 0.8 : 1;
  const concentrateRatio = inputs.dietMode === "8020" ? 0.2 : 0;
  const silageKg = Math.round(asFedTotal * silageRatio);
  const concentrateKg = Math.round(asFedTotal * concentrateRatio);
  const costOfSilage = silageKg * inputs.silagePrice;
  const costOfConcentrates = concentrateKg * inputs.concentratePrice;
  const totalFeedCost = costOfSilage + costOfConcentrates;
  const totalExpenses = totalFeedCost + inputs.caretakerSalary;
  const totalCashOut = totalExpenses + inputs.acquisitionCost;
  const grossSale = inputs.finalWeight * inputs.sellingPrice;
  const netIncome = grossSale - totalCashOut;
  const roiPercent = inputs.acquisitionCost > 0 ? (netIncome / inputs.acquisitionCost) * 100 : 0;
  const breakEvenPrice = inputs.finalWeight > 0 ? totalCashOut / inputs.finalWeight : 0;

  let advisory = "Healthy setup. Keep feed prices current and compare this scenario against at least one alternative.";
  if (netIncome < 0) {
    advisory = "Projected loss. Raise sale price assumptions, lower acquisition cost, or revisit the final weight target.";
  } else if (inputs.dryMatterPercent < 30 || inputs.dryMatterPercent > 40) {
    advisory = "Dry matter sits outside the usual 30% to 40% range. Check ration quality before relying on this plan.";
  } else if (averageDailyGain < 0.8) {
    advisory = "Daily gain looks conservative. Confirm whether the feeding strategy can realistically hit the finish target.";
  }

  return {
    inputs,
    outputs: {
      silageKg,
      concentrateKg,
      costOfSilage,
      costOfConcentrates,
      totalFeedCost,
      averageDailyGain,
      totalExpenses,
      totalCashOut,
      grossSale,
      netIncome,
      roiPercent,
      breakEvenPrice
    },
    advisory
  };
}

function applyProjection(projection) {
  state.preview = projection;
  applyMetrics(projection);
}

function applyMetrics(projection) {
  const { inputs, outputs, advisory } = projection;
  metricNodes.silage.textContent = `${formatWhole(outputs.silageKg)} kg`;
  metricNodes.concentrate.textContent = `${formatWhole(outputs.concentrateKg)} kg`;
  metricNodes.feedCost.textContent = formatCurrency(outputs.totalFeedCost);
  metricNodes.adg.textContent = `${formatNumber(outputs.averageDailyGain)} kg/day`;
  metricNodes.gross.textContent = formatCurrency(outputs.grossSale);
  metricNodes.net.textContent = formatCurrency(outputs.netIncome);
  metricNodes.roi.textContent = `ROI ${formatNumber(outputs.roiPercent)}%`;
  metricNodes.expenses.textContent = `Cycle expenses ${formatCurrency(outputs.totalCashOut)}`;
  metricNodes.breakeven.textContent = `Break-even sale ${formatCurrency(outputs.breakEvenPrice)}/kg`;
  metricNodes.silageCost.textContent = `Silage cost ${formatCurrency(outputs.costOfSilage)}`;
  metricNodes.concentrateCost.textContent = `Concentrate cost ${formatCurrency(outputs.costOfConcentrates)}`;
  metricNodes.feedMixBar.style.width = `${inputs.dietMode === "8020" ? 80 : 100}%`;
  metricNodes.feedMixLabel.textContent = inputs.dietMode === "8020" ? "Silage 80% | Concentrate 20%" : "Silage 100% | Concentrate 0%";
  advisoryCard.querySelector("p").textContent = advisory;
  resultHint.textContent = `${inputs.title ? `${inputs.title} | ` : ""}Live financial snapshot updates from the current form.`;
}

function hydrateProjectionForm(inputs, title) {
  projectionForm.elements.title.value = title;
  projectionForm.querySelector(`input[name="dietMode"][value="${inputs.dietMode}"]`).checked = true;
  projectionForm.elements.acquisitionCost.value = inputs.acquisitionCost;
  projectionForm.elements.entryWeight.value = inputs.entryWeight;
  projectionForm.elements.finalWeight.value = inputs.finalWeight;
  projectionForm.elements.sellingPrice.value = inputs.sellingPrice;
  projectionForm.elements.dryMatterPercent.value = inputs.dryMatterPercent;
  projectionForm.elements.silagePrice.value = inputs.silagePrice;
  projectionForm.elements.concentratePrice.value = inputs.concentratePrice;
  projectionForm.elements.caretakerSalary.value = inputs.caretakerSalary;
  syncDietFields();
  refreshPreview();
}

function resetProjectionForm() {
  applyDefaults();
  syncDietFields();
  refreshPreview();
}

function applyDefaults() {
  Object.entries(DEFAULT_INPUTS).forEach(([key, value]) => {
    if (key === "dietMode") {
      projectionForm.querySelector(`input[name="${key}"][value="${value}"]`).checked = true;
      return;
    }
    const element = projectionForm.elements[key];
    if (!element) {
      return;
    }
    element.value = value;
  });
}

function resetMetrics() {
  metricNodes.silage.textContent = "0 kg";
  metricNodes.concentrate.textContent = "0 kg";
  metricNodes.feedCost.textContent = "PHP 0.00";
  metricNodes.adg.textContent = "0.00 kg/day";
  metricNodes.gross.textContent = "PHP 0.00";
  metricNodes.net.textContent = "PHP 0.00";
  metricNodes.roi.textContent = "ROI 0.00%";
  metricNodes.expenses.textContent = "Cycle expenses PHP 0.00";
  metricNodes.breakeven.textContent = "Break-even sale PHP 0.00/kg";
  metricNodes.silageCost.textContent = "Silage cost PHP 0.00";
  metricNodes.concentrateCost.textContent = "Concentrate cost PHP 0.00";
  metricNodes.feedMixBar.style.width = "0%";
  metricNodes.feedMixLabel.textContent = "Silage 0% | Concentrate 0%";
  advisoryCard.querySelector("p").textContent = "Start entering values to populate the dashboard.";
}

function loadDemoData() {
  applyDefaults();
  projectionForm.elements.title.value = "Demo Finishing Batch";
  refreshPreview();
  window.location.hash = "#workspace";
}

function logout() {
  state.user = null;
  writeStorage(STORAGE_KEYS.session, null);
  renderAuth();
}

function getUserProjections() {
  if (!state.user) {
    return [];
  }
  return state.projections.filter((entry) => entry.userId === state.user.id);
}

function readInputsFromForm() {
  const values = formToObject(new FormData(projectionForm));
  return {
    ...values,
    title: values.title || ""
  };
}

function formToObject(formData) {
  return Object.fromEntries(Array.from(formData.entries()).map(([key, value]) => [key, value.toString()]));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP"
  }).format(Number(value || 0));
}

function formatWhole(value) {
  return Number(value || 0).toLocaleString("en-PH", {
    maximumFractionDigits: 0
  });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(value) {
  return new Date(value).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  if (value === null) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}

function cryptoRandomId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

