/* -------------------------------------------------------------
   AUTOMATEX360 CALCULATOR & BUILDER - ENGINE
   Reference Style: Finexy Financial Dashboard Aesthetic
   ------------------------------------------------------------- */

let state = {
  services: [],
  adminAuthenticated: false,
  webhook: {
    statuses: {},
    selectedServiceId: null
  },
  embed: {
    allowedParentOrigins: [],
    externalEnabled: false
  },
  currentView: "calculator", // 'calculator' | 'builder' | 'webhook' | 'embed'
  calculator: {
    selectedServiceId: null,
    currentStep: 0, // 0 = select service, 1..N = questions, N+1 = lead form
    answers: {}, // { [questionId]: [optionIndex, ...] }
    lead: {
      fullName: "",
      email: "",
      phone: "",
      address: "",
      notes: ""
    }
  },
  builder: {
    activeServiceId: null
  }
};

const CURRENCY_CODE = "CAD";
const CURRENCY_LOCALE = "en-CA";

const pageUrl = new URL(window.location.href);
const isEmbedMode = pageUrl.pathname.replace(/\/$/, '').endsWith('/embed') || pageUrl.searchParams.get('embed') === '1';
const requestedEmbedServiceId = isEmbedMode ? (pageUrl.searchParams.get('service') || '') : '';
let embedResizeFrame = null;
let lastEmbeddedHeight = 0;

// --- CLEAN MINIMAL SVG ICON LIBRARY (NO 3D EMOJIS) ---
function getIconSvg(name) {
  const iconKey = String(name || '').toLowerCase().trim();

  // Smart Keyword Matching for Services
  if (iconKey.includes('house') || iconKey.includes('extension') || iconKey.includes('home-extension')) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
  }
  if (iconKey.includes('building') || iconKey.includes('whole-home') || iconKey.includes('structure')) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="6" x2="9.01" y2="6"/><line x1="15" y1="6" x2="15.01" y2="6"/><line x1="9" y1="10" x2="9.01" y2="10"/><line x1="15" y1="10" x2="15.01" y2="10"/><line x1="9" y1="14" x2="9.01" y2="14"/><line x1="15" y1="14" x2="15.01" y2="14"/><path d="M10 22v-4h4v4"/></svg>`;
  }
  if (iconKey.includes('stair') || iconKey.includes('basement')) {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h5v-5h5v-5h5V4"/></svg>`;
  }
  if (iconKey.includes('kitchen') || iconKey.includes('cook')) {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V2"/><path d="M12 10v12"/><path d="M8 22h8"/></svg>`;
  }
  if (iconKey.includes('droplet') || iconKey.includes('bath') || iconKey.includes('water') || iconKey.includes('plumb')) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`;
  }
  if (iconKey.includes('wrench') || iconKey.includes('repair') || iconKey.includes('fix')) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
  }
  if (iconKey.includes('hammer') || iconKey.includes('construct') || iconKey.includes('carpentry')) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 12l-8.5 8.5a2.12 2.12 0 0 1-3-3L12 9"/><path d="M17.64 4.36a2.5 2.5 0 0 1 3.54 3.54l-2.6 2.6-3.54-3.54 2.6-2.6z"/></svg>`;
  }
  if (iconKey.includes('paint') || iconKey.includes('decorat')) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6M12 18v4M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M18 12h4M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24"/></svg>`;
  }
  if (iconKey.includes('ruler') || iconKey.includes('design') || iconKey.includes('architect')) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.3 15.3l-9.6-9.6a1 1 0 0 0-1.4 0l-5 5a1 1 0 0 0 0 1.4l9.6 9.6a1 1 0 0 0 1.4 0l5-5a1 1 0 0 0 0-1.4z"/><line x1="8.5" y1="12.5" x2="10.5" y2="14.5"/><line x1="11.5" y1="9.5" x2="13.5" y2="11.5"/><line x1="14.5" y1="6.5" x2="16.5" y2="8.5"/></svg>`;
  }
  if (iconKey.includes('sun') || iconKey.includes('outdoor') || iconKey.includes('landscape') || iconKey.includes('deck')) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  }

  // General App / UI Icons
  switch (iconKey) {
    case 'dashboard':
    case 'calculator':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/></svg>`;
    case 'builder':
    case 'tools':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
    case 'webhook':
    case 'link':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
    case 'embed':
    case 'code':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
    case 'search':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
    case 'bell':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
    case 'info':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    case 'plus':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    case 'check':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    case 'trash':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
    case 'arrow-up':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;
    case 'arrow-down':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
    case 'refresh':
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
    case 'send':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
    case 'close':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    case 'copy':
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    case 'image':
    case 'photo':
    case 'camera':
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    default:
      // Neutral house icon as safe default instead of an exclamation mark warning
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
  }
}

/**
 * Dynamically scales, compresses, and auto-formats Cloudinary images via URL transformations
 * Transforms 4K/1080p uploads into tiny, high-performance WebP/AVIF images
 */
function getOptimizedImageUrl(url, width = 600, height = null, crop = 'fill') {
  if (!url || typeof url !== 'string') return '';

  if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
    const transforms = ['f_auto', 'q_auto'];
    if (width) transforms.push(`w_${width}`);
    if (height) transforms.push(`h_${height}`);
    if (crop) transforms.push(`c_${crop}`);

    return url.replace('/upload/', `/upload/${transforms.join(',')}/`);
  }

}

// Service configuration is loaded from the protected server API.

function updateSyncStatus(status, text) {
  const badge = document.getElementById("cloud-sync-badge");
  const textElem = document.getElementById("sync-text");
  if (!badge || !textElem) return;

  badge.className = `cloud-sync-badge ${status}`;
  textElem.innerText = text;
}

// Initialize Application
document.addEventListener("DOMContentLoaded", async () => {
  if (isEmbedMode) {
    document.documentElement.classList.add("embed-mode-root");
    document.body.classList.add("embed-mode");
    state.currentView = "calculator";
    setupEmbeddedHeightMessaging();
  }
  setupNavigation();
  setupThemeToggle();
  await loadState();
  renderView();
  initDashboardAnimations();
});

async function loadState() {
  state.services = [];
  updateSyncStatus("syncing", "Loading...");
  try {
    const requests = [
      fetch("/api/services", { headers: { Accept: "application/json" } }),
      fetch("/api/embed/config", { headers: { Accept: "application/json" } })
    ];
    if (!isEmbedMode) {
      requests.push(fetch("/api/admin/session", { headers: { Accept: "application/json" } }));
    }

    const [servicesResponse, embedConfigResponse, sessionResponse] = await Promise.all(requests);
    if (servicesResponse.ok) {
      const data = await servicesResponse.json();
      if (data.currency !== CURRENCY_CODE) throw new Error(`Server pricing currency must be ${CURRENCY_CODE}.`);
      if (Array.isArray(data.services) && data.services.length) state.services = data.services;
    }
    if (embedConfigResponse.ok) {
      const embedConfig = await embedConfigResponse.json();
      state.embed.allowedParentOrigins = Array.isArray(embedConfig.allowedParentOrigins)
        ? embedConfig.allowedParentOrigins
        : [];
      state.embed.externalEnabled = Boolean(embedConfig.externalEnabled);
    }
    if (sessionResponse?.ok) {
      const session = await sessionResponse.json();
      state.adminAuthenticated = Boolean(session.authenticated);
    }
    updateSyncStatus("live", "Secure Server");
  } catch (error) {
    console.warn("Secure server unavailable:", error.message);
    updateSyncStatus("offline", "Server Required");
  }

  if (state.services.length > 0) {
    state.builder.activeServiceId = state.services[0].id;
    const embeddedService = state.services.find(service => service.id === requestedEmbedServiceId);
    if (embeddedService) {
      state.calculator.selectedServiceId = embeddedService.id;
      state.calculator.currentStep = 1;
    }
  }

  renderView();
}

async function saveServicesState() {
  if (!state.adminAuthenticated) {
    showToast("Administrator login required.");
    return false;
  }
  try {
    updateSyncStatus("syncing", "Saving...");
    const response = await fetch("/api/services", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ services: state.services })
    });
    if (response.status === 401) {
      state.adminAuthenticated = false;
      throw new Error("Your administrator session expired.");
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to save services.");
    if (data.currency !== CURRENCY_CODE) throw new Error(`Server pricing currency must be ${CURRENCY_CODE}.`);
    state.services = data.services;
    updateSyncStatus("live", "Secure Server");
    return true;
  } catch (error) {
    console.error("Secure save failed:", error.message);
    updateSyncStatus("offline", "Save Failed");
    showToast(error.message);
    return false;
  }
}

// --- CLOUDINARY OPTION IMAGE UPLOAD HANDLER ---
async function handleOptionImageUpload(serviceId, questionId, optionIndex, file, btnElem) {
  if (!file) return;

  const originalContent = btnElem ? btnElem.innerHTML : '📷 Image';
  if (btnElem) {
    btnElem.innerHTML = `⌛ Uploading...`;
    btnElem.style.pointerEvents = 'none';
  }

  try {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      throw new Error("Use a JPEG, PNG, or WebP image up to 5 MB.");
    }
    const res = await fetch("/api/admin/upload", {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Image upload failed");

    const imageUrl = data.url;

    const service = state.services.find(s => s.id === serviceId);
    if (service) {
      const q = service.questions.find(item => item.id === questionId);
      if (q && q.options[optionIndex]) {
        q.options[optionIndex].imageUrl = imageUrl;
        await saveServicesState();
        renderBuilder();
      }
    }
  } catch (err) {
    alert("Image upload error: " + err.message);
    if (btnElem) {
      btnElem.innerHTML = originalContent;
      btnElem.style.pointerEvents = 'auto';
    }
  }
}

async function removeOptionImage(serviceId, questionId, optionIndex) {
  const service = state.services.find(s => s.id === serviceId);
  if (service) {
    const q = service.questions.find(item => item.id === questionId);
    if (q && q.options[optionIndex]) {
      delete q.options[optionIndex].imageUrl;
      await saveServicesState();
      renderBuilder();
    }
  }
}

function setupNavigation() {
  // Top Navbar buttons
  document.querySelectorAll(".nav-link").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const view = btn.dataset.view;
      if (view) switchView(view);
    });
  });

  // Sidebar buttons
  document.querySelectorAll(".sidebar-nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      if (view) switchView(view);
    });
  });
}

function setupThemeToggle() {
  const lightBtn = document.getElementById("theme-light-btn");
  const darkBtn = document.getElementById("theme-dark-btn");

  if (lightBtn && darkBtn) {
    lightBtn.addEventListener("click", () => {
      document.body.classList.remove("dark-theme");
      lightBtn.classList.add("active");
      darkBtn.classList.remove("active");
      localStorage.setItem("pg_theme", "light");
    });

    darkBtn.addEventListener("click", () => {
      document.body.classList.add("dark-theme");
      darkBtn.classList.add("active");
      lightBtn.classList.remove("active");
      localStorage.setItem("pg_theme", "dark");
    });

    if (localStorage.getItem("pg_theme") === "dark") {
      document.body.classList.add("dark-theme");
      darkBtn.classList.add("active");
      lightBtn.classList.remove("active");
    }
  }
}

function switchView(viewName) {
  if (isEmbedMode && viewName !== "calculator") return;
  state.currentView = viewName;

  // Sync Nav pills
  document.querySelectorAll(".nav-link").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  // Sync Sidebar icons
  document.querySelectorAll(".sidebar-nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  // Sync View Sections
  document.querySelectorAll(".view-section").forEach(sec => {
    sec.classList.toggle("active", sec.id === `view-${viewName}`);
  });

  renderView();
}

function renderView() {
  if (state.currentView === "calculator") {
    renderCalculator();
  } else if (state.currentView === "builder") {
    renderBuilder();
  } else if (state.currentView === "webhook") {
    renderWebhookSettings();
  } else if (state.currentView === "embed") {
    renderEmbedGenerator();
  }
  setTimeout(initCustomSelects, 10);
}

/* =============================================================
   1. LIVE ESTIMATOR (CALCULATOR WIZARD) LOGIC
   ============================================================= */

function getSelectedService() {
  return state.services.find(s => s.id === state.calculator.selectedServiceId);
}

function calculateEstimate() {
  const service = getSelectedService();
  if (!service) return { minTotal: 0, maxTotal: 0, baseCost: 0, breakdown: [] };

  let minTotal = service.baseCost;
  let maxTotal = service.baseCost;
  let breakdown = [{ item: `${service.title} (Base Starting Price)`, min: service.baseCost, max: service.baseCost }];

  service.questions.forEach(q => {
    const selectedIndices = state.calculator.answers[q.id] || [];
    selectedIndices.forEach(optIndex => {
      const opt = q.options[optIndex];
      if (opt) {
        minTotal += opt.minPrice;
        maxTotal += opt.maxPrice;
        breakdown.push({
          item: `${q.title} → ${opt.label}`,
          min: opt.minPrice,
          max: opt.maxPrice
        });
      }
    });
  });

  return { minTotal, maxTotal, baseCost: service.baseCost, breakdown };
}

function formatCurrency(val) {
  return new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: 'currency',
    currency: CURRENCY_CODE,
    maximumFractionDigits: 0
  }).format(val);
}

function getBrandFooterHtml() {
  return `
    <div class="calculator-brand-footer">
      <a href="https://automatex360.com" target="_blank" rel="noopener noreferrer" class="powered-by-footer-link" title="Visit AutomateX360.com">
        <span>EstimatorX360</span>
        <span class="footer-divider">•</span>
        <span>Powered By <strong>AutomateX360</strong></span>
      </a>
    </div>
  `;
}

function renderCalculator() {
  const calcBody = document.getElementById("calculator-wizard-body");
  const tickerBar = document.getElementById("sticky-ticker-bar");
  const progressBar = document.getElementById("progress-bar-fill");
  const progressBarContainer = document.querySelector(".progress-bar-container");
  const stepBadge = document.getElementById("calc-step-badge");
  const serviceTag = document.getElementById("calc-service-tag");
  const estimateDisplay = document.getElementById("calc-estimate-value");

  if (!calcBody) return;

  const service = getSelectedService();

  // If no service selected or step 0, render Service Selection Grid
  if (!service || state.calculator.currentStep === 0) {
    if (tickerBar) tickerBar.style.display = "none";
    if (progressBarContainer) progressBarContainer.style.display = "none";
    if (progressBar) progressBar.style.width = "0%";

    let html = `
      <div class="section-title">Select Your Renovation Service</div>
      <div class="section-desc">Choose a service category below to calculate your instant min/max price estimate.</div>
      <div class="services-grid">
    `;

    state.services.forEach(s => {
      html += `
        <div class="service-card" onclick="selectServiceForCalc('${s.id}')">
          <div class="service-card-icon">${getIconSvg(s.icon || s.id || s.title)}</div>
          <div class="service-card-title">${escapeHtml(s.title)}</div>
          <div class="service-card-base">Base Starting Price: ${formatCurrency(s.baseCost)}</div>
          <button class="btn btn-primary" style="margin-top: 14px; width: 100%;">Select & Estimate →</button>
        </div>
      `;
    });

    html += `</div>`;
    calcBody.innerHTML = html + getBrandFooterHtml();
    return;
  }

  // Active Service Wizard Steps
  if (tickerBar) tickerBar.style.display = "flex";
  if (progressBarContainer) progressBarContainer.style.display = "block";
  const totalQuestions = service.questions.length;
  const currentStep = state.calculator.currentStep; // 1 to totalQuestions + 1 (lead form)

  // Update Header Ticker Bar
  const { minTotal, maxTotal } = calculateEstimate();
  if (estimateDisplay) estimateDisplay.innerText = `${formatCurrency(minTotal)} – ${formatCurrency(maxTotal)}`;
  if (serviceTag) serviceTag.innerText = service.title;

  if (currentStep <= totalQuestions) {
    if (stepBadge) stepBadge.innerText = `Question ${currentStep} of ${totalQuestions}`;
    const pct = Math.round((currentStep / (totalQuestions + 1)) * 100);
    if (progressBar) progressBar.style.width = `${pct}%`;

    const currentQuestion = service.questions[currentStep - 1];
    const selectedIndices = state.calculator.answers[currentQuestion.id] || [];

    let html = `
      <div class="section-title">${escapeHtml(currentQuestion.title)}</div>
      <div class="section-desc">${currentQuestion.type === 'multiple' ? 'Select all options that apply (multiple choice):' : 'Select one option below:'}</div>
      <div class="options-grid">
    `;

    currentQuestion.options.forEach((opt, idx) => {
      const isSelected = selectedIndices.includes(idx);
      const priceText = (opt.minPrice === 0 && opt.maxPrice === 0)
        ? `<span class="option-price-zero">No extra charge (${formatCurrency(0)} CAD)</span>`
        : `<span class="option-price-range">+${formatCurrency(opt.minPrice)} – ${formatCurrency(opt.maxPrice)}</span>`;

      const hasImage = Boolean(opt.imageUrl);

      html += `
        <div class="option-card ${isSelected ? 'selected' : ''} ${hasImage ? 'has-image' : ''}" onclick="toggleOptionSelect('${currentQuestion.id}', ${idx}, '${currentQuestion.type}')">
          ${hasImage ? `
            <div class="option-card-media">
              <img src="${escapeHtml(getOptimizedImageUrl(opt.imageUrl, 600, 300))}" alt="${escapeHtml(opt.label)}" loading="lazy" />
            </div>
          ` : ''}
          <div style="display: flex; align-items: flex-start; gap: 12px; width: 100%;">
            <div class="checkbox-circle">${isSelected ? getIconSvg('check') : ''}</div>
            <div class="option-content">
              <div class="option-label">${escapeHtml(opt.label)}</div>
              <div>${priceText}</div>
            </div>
          </div>
        </div>
      `;
    });

    html += `</div>`;

    // Footer Navigation
    const previousButton = requestedEmbedServiceId && currentStep === 1
      ? '<span></span>'
      : '<button class="btn btn-secondary" onclick="prevCalcStep()">← Previous</button>';
    html += `
      <div class="wizard-footer">
        ${previousButton}
        <button class="btn btn-primary" onclick="nextCalcStep()">Next Step →</button>
      </div>
    `;

    calcBody.innerHTML = html + getBrandFooterHtml();
  } else {
    // Final Step: Lead Contact Capture Form
    if (stepBadge) stepBadge.innerText = `Final Step`;
    if (progressBar) progressBar.style.width = `100%`;

    let html = `
      <div class="section-title">Get Your Detailed Instant Estimate</div>
      <div class="section-desc">Your estimated cost range is <strong>${formatCurrency(minTotal)} – ${formatCurrency(maxTotal)}</strong>. Enter your contact information below to send this estimate directly to our team.</div>
      
      <form id="calc-lead-form" onsubmit="handleLeadSubmit(event)">
        <div class="lead-form-grid">
          <div class="form-group">
            <label class="form-label">Full Name *</label>
            <input type="text" class="form-input" id="lead-name" value="${escapeHtml(state.calculator.lead.fullName)}" required placeholder="e.g. John Smith" />
          </div>
          <div class="form-group">
            <label class="form-label">Email Address *</label>
            <input type="email" class="form-input" id="lead-email" value="${escapeHtml(state.calculator.lead.email)}" required placeholder="e.g. john@example.com" />
          </div>
          <div class="form-group">
            <label class="form-label">Phone Number *</label>
            <input type="tel" class="form-input" id="lead-phone" value="${escapeHtml(state.calculator.lead.phone)}" required placeholder="e.g. (555) 000-1234" />
          </div>
          <div class="form-group">
            <label class="form-label">Property Address / City</label>
            <input type="text" class="form-input" id="lead-address" value="${escapeHtml(state.calculator.lead.address)}" placeholder="e.g. 123 Main St, Toronto, ON" />
          </div>
          <div class="form-group full-width">
            <label class="form-label">Project Details / Notes</label>
            <textarea class="form-textarea" id="lead-notes" rows="3" placeholder="Tell us any specific requirements or timelines...">${escapeHtml(state.calculator.lead.notes)}</textarea>
          </div>
        </div>

        <div class="wizard-footer">
          <button type="button" class="btn btn-secondary" onclick="prevCalcStep()">← Back to Questions</button>
          <button type="submit" class="btn btn-success">${getIconSvg('send')} Submit & Send Estimate</button>
        </div>
      </form>
    `;

    calcBody.innerHTML = html + getBrandFooterHtml();
  }
}

function selectServiceForCalc(serviceId) {
  state.calculator.selectedServiceId = serviceId;
  state.calculator.currentStep = 1;
  state.calculator.answers = {};
  if (state.currentView !== "calculator") {
    switchView("calculator");
  } else {
    renderCalculator();
  }
}

function toggleOptionSelect(questionId, optionIndex, type) {
  if (!state.calculator.answers[questionId]) {
    state.calculator.answers[questionId] = [];
  }

  if (type === "single") {
    state.calculator.answers[questionId] = [optionIndex];
  } else {
    const list = state.calculator.answers[questionId];
    const pos = list.indexOf(optionIndex);
    if (pos > -1) {
      list.splice(pos, 1);
    } else {
      list.push(optionIndex);
    }
  }

  renderCalculator();
}

function prevCalcStep() {
  if (requestedEmbedServiceId && state.calculator.currentStep === 1) return;
  if (state.calculator.currentStep > 0) {
    state.calculator.currentStep--;
    renderCalculator();
  }
}

function nextCalcStep() {
  const service = getSelectedService();
  const totalQuestions = service.questions.length;
  if (state.calculator.currentStep <= totalQuestions) {
    state.calculator.currentStep++;
    renderCalculator();
  }
}

async function handleLeadSubmit(e) {
  e.preventDefault();
  state.calculator.lead.fullName = document.getElementById("lead-name").value;
  state.calculator.lead.email = document.getElementById("lead-email").value;
  state.calculator.lead.phone = document.getElementById("lead-phone").value;
  state.calculator.lead.address = document.getElementById("lead-address").value;
  state.calculator.lead.notes = document.getElementById("lead-notes").value;

  const service = getSelectedService();
  const { minTotal, maxTotal, breakdown } = calculateEstimate();

  const payload = {
    lead: {
      full_name: state.calculator.lead.fullName,
      email: state.calculator.lead.email,
      phone: state.calculator.lead.phone,
      address: state.calculator.lead.address,
      notes: state.calculator.lead.notes
    },
    selection: {
      service_id: service.id,
      selections: state.calculator.answers
    }
  };

  showToast("Sending your estimate...");
  try {
    const response = await fetch("/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to deliver the estimate.");
    showToast("Estimate sent successfully!");
    openBreakdownModal(service, result.estimate.estimated_lower_bound, result.estimate.estimated_upper_bound, breakdown);
  } catch (error) {
    console.error("Estimate submission failed:", error.message);
    showToast(error.message);
  }
}

function openBreakdownModal(service, minTotal, maxTotal, breakdown) {
  const modal = document.getElementById("breakdown-modal");
  const modalBody = document.getElementById("modal-breakdown-body");

  let html = `
    <h3 class="section-title">Estimate Summary for ${escapeHtml(service.title)}</h3>
    <p class="section-desc">Thank you, <strong>${escapeHtml(state.calculator.lead.fullName)}</strong>! Here is your complete itemized cost breakdown:</p>
    <div class="breakdown-list">
  `;

  breakdown.forEach(item => {
    html += `
      <div class="breakdown-item">
        <span>${escapeHtml(item.item)}</span>
        <span>+${formatCurrency(item.min)} – ${formatCurrency(item.max)}</span>
      </div>
    `;
  });

  html += `
    <div class="breakdown-item total">
      <span>TOTAL ESTIMATED RANGE</span>
      <span>${formatCurrency(minTotal)} – ${formatCurrency(maxTotal)}</span>
    </div>
  </div>
  <p style="font-size: 13px; color: var(--text-muted); margin-top: 14px;">A copy of this estimate has been logged and sent via webhook integration.</p>
  `;

  modalBody.innerHTML = html;
  modal.classList.add("active");
}

function closeModal() {
  document.getElementById("breakdown-modal").classList.remove("active");
  state.calculator.selectedServiceId = null;
  state.calculator.currentStep = 0;
  state.calculator.answers = {};
  renderCalculator();
}

/* =============================================================
   2. FORM & PRICE BUILDER (ADMIN CRUD) LOGIC
   ============================================================= */

function renderAdminGate(container, destination) {
  container.innerHTML = `
    <div class="settings-card" style="max-width: 560px; margin: 40px auto;">
      <h2 class="section-title">Administrator Access</h2>
      <p class="section-desc">This area changes pricing and integrations. Sign in with the server administrator password.</p>
      <form onsubmit="adminLogin(event, '${escapeHtml(destination)}')">
        <div class="form-group" style="margin-bottom: 18px;">
          <label class="form-label" for="admin-password-input">Administrator Password</label>
          <input type="password" class="form-input" id="admin-password-input" minlength="16" maxlength="256" autocomplete="current-password" required />
        </div>
        <button class="btn btn-primary" type="submit">${getIconSvg('check')} Sign In</button>
      </form>
    </div>
  `;
}

async function adminLogin(event, destination) {
  event.preventDefault();
  const input = document.getElementById("admin-password-input");
  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ password: input.value })
    });
    const result = await response.json();
    input.value = "";
    if (!response.ok) throw new Error(result.error || "Sign-in failed.");
    state.adminAuthenticated = true;
    showToast("Administrator access granted.");
    if (destination === "webhook") renderWebhookSettings();
    else renderBuilder();
  } catch (error) {
    showToast(error.message);
  }
}

async function adminLogout() {
  await fetch("/api/admin/logout", { method: "POST" });
  state.adminAuthenticated = false;
  state.currentView = "calculator";
  switchView("calculator");
  showToast("Signed out.");
}

function renderBuilder() {
  const container = document.getElementById("builder-container");
  if (!container) return;
  if (!state.adminAuthenticated) return renderAdminGate(container, "builder");

  let html = `
    <div class="builder-header">
      <div>
        <h2 class="section-title">EstimatorX360 Form Builder</h2>
        <p class="section-desc">Add services, configure starting base costs, edit questions, and set Min/Max price ranges.</p>
      </div>
      <div style="display: flex; gap: 10px;">
        <button class="btn btn-primary" onclick="addNewServicePrompt()">${getIconSvg('plus')} Create Service</button>
        <button class="btn btn-secondary" onclick="adminLogout()">Sign Out</button>
      </div>
    </div>

    <!-- Service Selector Tabs -->
    <div class="service-selector-bar">
  `;

  state.services.forEach(s => {
    const isActive = s.id === state.builder.activeServiceId;
    html += `
      <button class="service-tab-btn ${isActive ? 'active' : ''}" onclick="setActiveBuilderService('${s.id}')">
        ${getIconSvg(s.icon || s.id || s.title)}
        <span>${escapeHtml(s.title)}</span>
      </button>
    `;
  });

  html += `</div>`;

  const activeService = state.services.find(s => s.id === state.builder.activeServiceId);
  if (!activeService) {
    container.innerHTML = html + `<p>No service selected.</p>`;
    return;
  }

  // Active Service Editor Card
  html += `
    <div class="service-edit-card">
      <div class="service-meta-row">
        <div class="form-group">
          <label class="form-label">Service Title</label>
          <input type="text" class="form-input" value="${escapeHtml(activeService.title)}" onchange="updateServiceTitle('${activeService.id}', this.value)" />
        </div>
        <div class="form-group">
          <label class="form-label">Base Cost (CAD)</label>
          <div class="input-with-prefix">
            <span class="input-prefix">$</span>
            <input type="number" step="100" class="form-input" value="${activeService.baseCost}" onchange="updateServiceBaseCost('${activeService.id}', this.value)" />
            <div class="stepper-btn-group">
              <button type="button" class="stepper-btn" onclick="stepPriceInput(this, 100)" title="Increase CAD $100">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="18 15 12 9 6 15"/></svg>
              </button>
              <button type="button" class="stepper-btn" onclick="stepPriceInput(this, -100)" title="Decrease CAD $100">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>
          </div>
        </div>
        <div></div>
        <div>
          <button class="btn btn-danger" onclick="deleteService('${activeService.id}')">${getIconSvg('trash')} Delete Service</button>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="font-size: 17px; font-weight: 700;">Questions & Min/Max Price Options</h3>
        <button class="btn btn-secondary" onclick="addQuestionToService('${activeService.id}')">${getIconSvg('plus')} Add Question</button>
      </div>
  `;

  // Render Questions List for Active Service
  activeService.questions.forEach((q, qIndex) => {
    html += `
      <div class="question-builder-card">
        <div class="question-card-header">
          <div style="flex-grow: 1; display: flex; gap: 12px; align-items: center;">
            <span style="font-weight: 800; color: var(--accent-coral);">Q${qIndex + 1}</span>
            <input type="text" class="form-input" style="flex-grow: 1;" value="${escapeHtml(q.title)}" onchange="updateQuestionTitle('${activeService.id}', '${q.id}', this.value)" placeholder="Enter Question Title..." />
            <select class="form-select" style="width: 160px;" onchange="updateQuestionType('${activeService.id}', '${q.id}', this.value)">
              <option value="single" ${q.type === 'single' ? 'selected' : ''}>Single Choice</option>
              <option value="multiple" ${q.type === 'multiple' ? 'selected' : ''}>Multiple Choice</option>
            </select>
          </div>
          <div class="question-actions">
            <button class="action-btn-icon" onclick="moveQuestion('${activeService.id}', ${qIndex}, -1)" title="Move Up">${getIconSvg('arrow-up')}</button>
            <button class="action-btn-icon" onclick="moveQuestion('${activeService.id}', ${qIndex}, 1)" title="Move Down">${getIconSvg('arrow-down')}</button>
            <button class="action-btn-icon" style="color: #EF4444;" onclick="deleteQuestion('${activeService.id}', '${q.id}')" title="Delete Question">${getIconSvg('close')}</button>
          </div>
        </div>

        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px; font-weight: 600;">Answer Options with Min/Max Price Adjustments (CAD):</div>
        <div class="options-builder-list">
    `;

    q.options.forEach((opt, optIndex) => {
      html += `
        <div class="option-builder-row">
          ${opt.imageUrl ? `
            <div class="option-img-preview-box" title="Option Image Preview">
              <img src="${escapeHtml(getOptimizedImageUrl(opt.imageUrl, 100, 100))}" alt="${escapeHtml(opt.label)}" />
              <button type="button" class="option-img-delete-btn" onclick="removeOptionImage('${activeService.id}', '${q.id}', ${optIndex})" title="Remove Image">✕</button>
            </div>
          ` : `
            <label class="btn-image-upload" title="Upload Option Image (Cloudinary 25GB Free)">
              ${getIconSvg('image')} Image
              <input type="file" accept="image/*" style="display: none;" onchange="handleOptionImageUpload('${activeService.id}', '${q.id}', ${optIndex}, this.files[0], this.parentElement)" />
            </label>
          `}
          <input type="text" class="form-input" value="${escapeHtml(opt.label)}" onchange="updateOptionLabel('${activeService.id}', '${q.id}', ${optIndex}, this.value)" placeholder="Option Name..." />
          <div class="input-with-prefix">
            <span class="input-prefix">$</span>
            <input type="number" step="100" class="form-input" value="${opt.minPrice}" placeholder="Min Price" onchange="updateOptionMinPrice('${activeService.id}', '${q.id}', ${optIndex}, this.value)" />
            <div class="stepper-btn-group">
              <button type="button" class="stepper-btn" onclick="stepPriceInput(this, 100)" title="Increase CAD $100">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="18 15 12 9 6 15"/></svg>
              </button>
              <button type="button" class="stepper-btn" onclick="stepPriceInput(this, -100)" title="Decrease CAD $100">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>
          </div>
          <div class="input-with-prefix">
            <span class="input-prefix">$</span>
            <input type="number" step="100" class="form-input" value="${opt.maxPrice}" placeholder="Max Price" onchange="updateOptionMaxPrice('${activeService.id}', '${q.id}', ${optIndex}, this.value)" />
            <div class="stepper-btn-group">
              <button type="button" class="stepper-btn" onclick="stepPriceInput(this, 100)" title="Increase CAD $100">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="18 15 12 9 6 15"/></svg>
              </button>
              <button type="button" class="stepper-btn" onclick="stepPriceInput(this, -100)" title="Decrease CAD $100">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="action-btn-icon" onclick="moveOption('${activeService.id}', '${q.id}', ${optIndex}, -1)">${getIconSvg('arrow-up')}</button>
            <button class="action-btn-icon" onclick="moveOption('${activeService.id}', '${q.id}', ${optIndex}, 1)">${getIconSvg('arrow-down')}</button>
            <button class="action-btn-icon" style="color: #EF4444;" onclick="deleteOption('${activeService.id}', '${q.id}', ${optIndex})">${getIconSvg('close')}</button>
          </div>
        </div>
      `;
    });

    html += `
        </div>
        <button class="btn btn-secondary" style="margin-top: 12px; padding: 6px 14px; font-size: 12px;" onclick="addOptionToQuestion('${activeService.id}', '${q.id}')">${getIconSvg('plus')} Add Option</button>
      </div>
    `;
  });

  html += `
    <div class="generated-fields-panel generated-fields-panel-end">
      <div>
        <h3 style="font-size: 17px; font-weight: 700;">Generated GHL Custom Field Names</h3>
        <p class="generated-fields-help">One field is generated for every question and updates when the form or question title changes.</p>
      </div>
      <div class="code-block generated-fields-code">${escapeHtml(getGeneratedFieldNames(activeService).join("\n") || "Add a question to generate its GHL custom field name.")}</div>
      <button class="btn btn-secondary" type="button" onclick="copyGeneratedFields('${activeService.id}')">${getIconSvg('copy')} Copy Field Names</button>
    </div>
  </div>`;
  container.innerHTML = html;
}

function setActiveBuilderService(serviceId) {
  state.builder.activeServiceId = serviceId;
  renderBuilder();
}

async function updateServiceTitle(serviceId, title) {
  const service = state.services.find(s => s.id === serviceId);
  if (service) {
    const cleanedTitle = title.trim();
    const duplicate = state.services.some(item =>
      item.id !== serviceId && normalizeName(item.title) === normalizeName(cleanedTitle)
    );
    if (!cleanedTitle || duplicate) {
      showToast(duplicate ? "A form with this name already exists." : "Form name cannot be empty.");
      renderBuilder();
      return;
    }
    const previousTitle = service.title;
    service.title = cleanedTitle;
    if (!(await saveServicesState())) service.title = previousTitle;
    renderBuilder();
  }
}

function updateServiceBaseCost(serviceId, val) {
  const service = state.services.find(s => s.id === serviceId);
  if (service) {
    service.baseCost = parseFloat(val) || 0;
    saveServicesState();
  }
}

let pendingDeleteServiceId = null;

function addNewServicePrompt() {
  openCreateServiceModal();
}

function openCreateServiceModal() {
  const modal = document.getElementById("create-service-modal");
  const form = document.getElementById("create-service-form");
  if (modal && form) {
    form.reset();
    document.getElementById("new-service-basecost").value = "1000";
    document.getElementById("new-service-title")?.setCustomValidity("");
    modal.classList.add("active");
    setTimeout(() => {
      initCustomSelects();
      const input = document.getElementById("new-service-title");
      if (input) input.focus();
    }, 100);
  }
}

function closeCreateServiceModal() {
  const modal = document.getElementById("create-service-modal");
  if (modal) modal.classList.remove("active");
}

async function handleCreateServiceSubmit(e) {
  if (e) e.preventDefault();
  const titleInput = document.getElementById("new-service-title");
  const baseCostInput = document.getElementById("new-service-basecost");
  const iconInput = document.getElementById("new-service-icon");

  const title = titleInput ? titleInput.value.trim() : "";
  if (!title) return;
  titleInput.setCustomValidity("");
  if (state.services.some(service => normalizeName(service.title) === normalizeName(title))) {
    titleInput.setCustomValidity("A form with this name already exists.");
    titleInput.reportValidity();
    showToast("A form with this name already exists.");
    return;
  }

  const baseCost = baseCostInput ? (parseFloat(baseCostInput.value) || 0) : 1000;
  const icon = iconInput ? iconInput.value : "house";

  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();
  const previousActiveServiceId = state.builder.activeServiceId;
  const newService = {
    id: id,
    title: title,
    icon: icon,
    baseCost: baseCost,
    questions: []
  };
  state.services.push(newService);

  state.builder.activeServiceId = id;
  if (!(await saveServicesState())) {
    state.services = state.services.filter(service => service !== newService);
    state.builder.activeServiceId = previousActiveServiceId;
    renderBuilder();
    return;
  }
  renderBuilder();
  closeCreateServiceModal();
  showToast("New service estimate created!");
}

function deleteService(serviceId) {
  pendingDeleteServiceId = serviceId;
  const service = state.services.find(s => s.id === serviceId);
  const targetLabel = document.getElementById("delete-service-name-target");
  if (targetLabel && service) {
    targetLabel.textContent = `"${service.title}"`;
  }
  const modal = document.getElementById("delete-service-modal");
  if (modal) modal.classList.add("active");
}

function closeDeleteServiceModal() {
  pendingDeleteServiceId = null;
  const modal = document.getElementById("delete-service-modal");
  if (modal) modal.classList.remove("active");
}

async function confirmDeleteService() {
  if (!pendingDeleteServiceId) return;
  const deletedId = pendingDeleteServiceId;
  state.services = state.services.filter(s => s.id !== deletedId);
  if (state.services.length > 0) {
    state.builder.activeServiceId = state.services[0].id;
  } else {
    state.builder.activeServiceId = null;
  }

  await saveServicesState();
  renderBuilder();
  closeDeleteServiceModal();
  showToast("Service deleted.");
}

function addQuestionToService(serviceId) {
  const service = state.services.find(s => s.id === serviceId);
  if (service) {
    const newQId = "q_" + Date.now();
    let questionNumber = service.questions.length + 1;
    let questionTitle = `New Question ${questionNumber}`;
    while (service.questions.some(question => normalizeName(question.title) === normalizeName(questionTitle))) {
      questionNumber++;
      questionTitle = `New Question ${questionNumber}`;
    }
    service.questions.push({
      id: newQId,
      title: questionTitle,
      type: "single",
      options: [
        { label: "Option 1", minPrice: 0, maxPrice: 1000 }
      ]
    });
    saveServicesState();
    renderBuilder();
  }
}

function deleteQuestion(serviceId, qId) {
  const service = state.services.find(s => s.id === serviceId);
  if (service) {
    service.questions = service.questions.filter(q => q.id !== qId);
    saveServicesState();
    renderBuilder();
  }
}

async function updateQuestionTitle(serviceId, qId, title) {
  const service = state.services.find(s => s.id === serviceId);
  if (service) {
    const q = service.questions.find(item => item.id === qId);
    if (!q) return;
    const cleanedTitle = title.trim();
    if (!cleanedTitle) {
      showToast("Question name cannot be empty.");
      renderBuilder();
      return;
    }
    const answerFieldKey = getAnswerFieldKey(cleanedTitle);
    const mappingConflict = !answerFieldKey || service.questions.some(question =>
      question.id !== qId && getAnswerFieldKey(question.title) === answerFieldKey
    );
    if (mappingConflict) {
      showToast("Use a different question name so its GHL answer field stays unique.");
      renderBuilder();
      return;
    }
    const previousTitle = q.title;
    q.title = cleanedTitle;
    if (!(await saveServicesState())) q.title = previousTitle;
    renderBuilder();
  }
}

function updateQuestionType(serviceId, qId, type) {
  const service = state.services.find(s => s.id === serviceId);
  if (service) {
    const q = service.questions.find(item => item.id === qId);
    if (q) q.type = type;
    saveServicesState();
  }
}

function moveQuestion(serviceId, index, dir) {
  const service = state.services.find(s => s.id === serviceId);
  if (service) {
    const targetIdx = index + dir;
    if (targetIdx >= 0 && targetIdx < service.questions.length) {
      const temp = service.questions[index];
      service.questions[index] = service.questions[targetIdx];
      service.questions[targetIdx] = temp;
      saveServicesState();
      renderBuilder();
    }
  }
}

function addOptionToQuestion(serviceId, qId) {
  const service = state.services.find(s => s.id === serviceId);
  if (service) {
    const q = service.questions.find(item => item.id === qId);
    if (q) {
      q.options.push({ label: "New Option", minPrice: 0, maxPrice: 500 });
      saveServicesState();
      renderBuilder();
    }
  }
}

function deleteOption(serviceId, qId, optIndex) {
  const service = state.services.find(s => s.id === serviceId);
  if (service) {
    const q = service.questions.find(item => item.id === qId);
    if (q) {
      q.options.splice(optIndex, 1);
      saveServicesState();
      renderBuilder();
    }
  }
}

function updateOptionLabel(serviceId, qId, optIndex, val) {
  const service = state.services.find(s => s.id === serviceId);
  if (service) {
    const q = service.questions.find(item => item.id === qId);
    if (q && q.options[optIndex]) {
      q.options[optIndex].label = val;
      saveServicesState();
    }
  }
}

function updateOptionMinPrice(serviceId, qId, optIndex, val) {
  const service = state.services.find(s => s.id === serviceId);
  if (service) {
    const q = service.questions.find(item => item.id === qId);
    if (q && q.options[optIndex]) {
      q.options[optIndex].minPrice = parseFloat(val) || 0;
      saveServicesState();
    }
  }
}

function updateOptionMaxPrice(serviceId, qId, optIndex, val) {
  const service = state.services.find(s => s.id === serviceId);
  if (service) {
    const q = service.questions.find(item => item.id === qId);
    if (q && q.options[optIndex]) {
      q.options[optIndex].maxPrice = parseFloat(val) || 0;
      saveServicesState();
    }
  }
}

function moveOption(serviceId, qId, optIndex, dir) {
  const service = state.services.find(s => s.id === serviceId);
  if (service) {
    const q = service.questions.find(item => item.id === qId);
    if (q) {
      const targetIdx = optIndex + dir;
      if (targetIdx >= 0 && targetIdx < q.options.length) {
        const temp = q.options[optIndex];
        q.options[optIndex] = q.options[targetIdx];
        q.options[targetIdx] = temp;
        saveServicesState();
        renderBuilder();
      }
    }
  }
}

/* =============================================================
   3. GHL WEBHOOK SETTINGS LOGIC
   ============================================================= */

function normalizeName(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function getGeneratedFieldNames(service) {
  if (!service) return [];
  return service.questions.map(question => `${service.title}: ${question.title}`);
}

async function copyGeneratedFields(serviceId = "") {
  const services = serviceId
    ? state.services.filter(service => service.id === serviceId)
    : state.services;
  const text = services.flatMap(getGeneratedFieldNames).join("\n");
  if (!text) {
    showToast("Add at least one question before copying field names.");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast("GHL custom field names copied!");
  } catch {
    showToast("Clipboard access was blocked. Select and copy the field names manually.");
  }
}

function getAnswerFieldKey(questionTitle) {
  return String(questionTitle || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildWebhookSample(service) {
  const answerFields = {};
  let minTotal = service.baseCost;
  let maxTotal = service.baseCost;
  const answers = service.questions.map(question => {
    const option = question.options[0];
    if (option) {
      minTotal += option.minPrice;
      maxTotal += option.maxPrice;
    }
    answerFields[getAnswerFieldKey(question.title)] = option?.label || "";
    return {
      question_id: question.id,
      question_title: question.title,
      selected_options: option ? [{ label: option.label, min_price: option.minPrice, max_price: option.maxPrice }] : []
    };
  });
  return JSON.stringify({
    event: "estimate_submitted",
    lead: {
      full_name: "Jane Smith",
      email: "jane@example.com",
      phone: "+15550192834",
      address: "456 Oak Avenue",
      notes: "Interested in starting project next month"
    },
    estimate: {
      service_id: service.id,
      service_name: service.title,
      base_cost: service.baseCost,
      estimated_lower_bound: minTotal,
      estimated_upper_bound: maxTotal,
      formatted_estimate_range: `${formatCurrency(minTotal)} - ${formatCurrency(maxTotal)}`,
      currency: CURRENCY_CODE
    },
    answers,
    answer_fields: answerFields,
    submitted_at: new Date().toISOString()
  }, null, 2);
}

async function renderWebhookSettings() {
  const container = document.getElementById("webhook-container");
  if (!container) return;
  if (!state.adminAuthenticated) return renderAdminGate(container, "webhook");

  container.innerHTML = `<div class="settings-card"><p class="section-desc">Loading protected per-form webhook settings...</p></div>`;
  try {
    const response = await fetch("/api/admin/webhooks", { headers: { Accept: "application/json" } });
    const result = await response.json();
    if (response.status === 401) {
      state.adminAuthenticated = false;
      return renderAdminGate(container, "webhook");
    }
    if (!response.ok) throw new Error(result.error || "Unable to load webhook settings.");
    state.webhook.statuses = Object.fromEntries((result.webhooks || []).map(item => [item.serviceId, item]));
    if (!state.services.some(service => service.id === state.webhook.selectedServiceId)) {
      state.webhook.selectedServiceId = state.services[0]?.id || null;
    }
    renderWebhookManager(container);
  } catch (error) {
    container.innerHTML = `<div class="settings-card"><div class="info-alert"><div>${getIconSvg('info')}</div><div>${escapeHtml(error.message)}</div></div></div>`;
  }
}

function renderWebhookManager(container = document.getElementById("webhook-container")) {
  if (!container) return;
  const service = state.services.find(item => item.id === state.webhook.selectedServiceId);
  if (!service) {
    container.innerHTML = `<div class="settings-card"><p class="section-desc">Create a form before configuring a webhook.</p></div>`;
    return;
  }

  const status = state.webhook.statuses[service.id] || { configured: false, source: "none" };
  const statusLabel = status.source === "form"
    ? "Configured specifically for this form"
    : status.source === "default"
      ? "Using the legacy default webhook"
      : status.source === "invalid"
        ? "Stored configuration is invalid — replace it"
        : "Not configured";
  const serviceOptions = state.services.map(item =>
    `<option value="${escapeHtml(item.id)}" ${item.id === service.id ? "selected" : ""}>${escapeHtml(item.title)}</option>`
  ).join("");
  const mappingText = service.questions.map(question =>
    `${service.title}: ${question.title}\nAnswer value: answer_fields.${getAnswerFieldKey(question.title)}`
  ).join("\n\n") || "Add questions to this form to generate separate answer fields.";
  const sampleJSON = buildWebhookSample(service);

  container.innerHTML = `
    <div class="settings-card">
      <div class="builder-header">
        <div>
          <h2 class="section-title">Per-Form GHL Webhooks</h2>
          <p class="section-desc">Each form sends only its own submission to its assigned webhook. Saved URLs stay protected on the server and are never displayed again.</p>
        </div>
        <button class="btn btn-secondary" onclick="adminLogout()">Sign Out</button>
      </div>

      <div class="form-group webhook-form-selector">
        <label class="form-label" for="webhook-form-select">Choose form</label>
        <select class="form-select" id="webhook-form-select" onchange="selectWebhookForm(this.value)">${serviceOptions}</select>
      </div>

      <div class="webhook-service-card">
        <div class="webhook-service-heading">
          <div>
            <h3>${escapeHtml(service.title)}</h3>
            <span class="webhook-status ${status.configured ? 'configured' : 'missing'}">${escapeHtml(statusLabel)}</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="service-webhook-url">Private GHL inbound webhook URL</label>
          <input type="url" id="service-webhook-url" class="form-input" placeholder="https://services.leadconnectorhq.com/hooks/..." autocomplete="off" spellcheck="false" />
          <p class="generated-fields-help">For security, an existing URL is never returned to the browser. Paste a URL here only to add or replace it.</p>
        </div>
        <div class="webhook-actions">
          <button class="btn btn-primary" type="button" onclick="saveFormWebhook('${service.id}')">Save for ${escapeHtml(service.title)}</button>
          <button class="btn btn-secondary" type="button" onclick="testFormWebhook('${service.id}')" ${status.configured ? '' : 'disabled'}>${getIconSvg('send')} Send Mapping Test</button>
          <button class="btn btn-danger" type="button" onclick="clearFormWebhook('${service.id}')" ${status.configured ? '' : 'disabled'}>Clear Webhook</button>
        </div>
      </div>

      <h3 class="webhook-subheading">Separate question mappings for ${escapeHtml(service.title)}</h3>
      <p class="generated-fields-help">Create the named text fields in GHL, then map each one to its corresponding <code>answer_fields...</code> value.</p>
      <div class="code-block">${escapeHtml(mappingText)}</div>

      <h3 class="webhook-subheading">JSON payload for ${escapeHtml(service.title)}</h3>
      <div class="code-block">${escapeHtml(sampleJSON)}</div>
    </div>
  `;
  setTimeout(initCustomSelects, 10);
}

function selectWebhookForm(serviceId) {
  if (!state.services.some(service => service.id === serviceId)) return;
  state.webhook.selectedServiceId = serviceId;
  renderWebhookManager();
}

function updateWebhookStatus(result) {
  state.webhook.statuses[result.serviceId] = result;
  renderWebhookManager();
}

async function saveFormWebhook(serviceId) {
  const input = document.getElementById("service-webhook-url");
  const webhookUrl = input?.value.trim() || "";
  if (!webhookUrl) {
    showToast("Paste this form's GHL webhook URL first.");
    return;
  }
  try {
    const response = await fetch(`/api/admin/webhooks/${encodeURIComponent(serviceId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ webhookUrl })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to save webhook.");
    if (input) input.value = "";
    updateWebhookStatus(result);
    showToast("Webhook saved securely for this form.");
  } catch (error) {
    showToast(error.message);
  }
}

async function clearFormWebhook(serviceId) {
  if (!window.confirm("Clear the webhook assigned to this form? Submissions will stop until another URL is saved.")) return;
  try {
    const response = await fetch(`/api/admin/webhooks/${encodeURIComponent(serviceId)}`, {
      method: "DELETE",
      headers: { Accept: "application/json" }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to clear webhook.");
    updateWebhookStatus(result);
    showToast("Webhook cleared for this form.");
  } catch (error) {
    showToast(error.message);
  }
}

async function testFormWebhook(serviceId) {
  showToast("Sending this form's mapping test to GHL...");
  try {
    const response = await fetch(`/api/admin/webhooks/${encodeURIComponent(serviceId)}/test`, {
      method: "POST",
      headers: { Accept: "application/json" }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Webhook test failed.");
    showToast("This form's mapping test was delivered to GHL!");
  } catch (error) {
    showToast(error.message);
  }
}

/* =============================================================
   4. EMBED CODE GENERATOR LOGIC
   ============================================================= */

function getEmbedUrl(serviceId = "") {
  const embedUrl = new URL("/embed", window.location.origin);
  if (serviceId) embedUrl.searchParams.set("service", serviceId);
  return embedUrl.toString();
}

function buildEmbedCode(serviceId = "") {
  const embedUrl = getEmbedUrl(serviceId);
  return `<iframe
  src="${embedUrl}"
  width="100%"
  height="760"
  style="display:block;width:100%;min-height:500px;border:0;outline:0;border-radius:20px;overflow:hidden;box-shadow:0 16px 42px rgba(18,19,22,0.14);"
  title="EstimatorX360 renovation estimator"
  loading="lazy"
  referrerpolicy="no-referrer"
  sandbox="allow-forms allow-scripts allow-same-origin"
  scrolling="no"
></iframe>
<script>
(() => {
  const frame = document.currentScript.previousElementSibling;
  const frameOrigin = new URL(frame.src).origin;
  window.addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow || event.origin !== frameOrigin) return;
    if (event.data?.type !== "automatex360:resize") return;
    const height = Number(event.data.height);
    if (Number.isFinite(height)) frame.style.height = Math.min(5000, Math.max(500, height)) + "px";
  });
})();
</script>`;
}

function renderEmbedGenerator() {
  const container = document.getElementById("embed-container");
  if (!container) return;

  const iframeCode = buildEmbedCode();
  const allowedOrigins = state.embed.allowedParentOrigins.map(origin => escapeHtml(origin)).join(", ");
  const statusText = state.embed.externalEnabled
    ? `External embedding is enabled for: <strong>${allowedOrigins}</strong>`
    : `External embedding is currently locked. Add the exact published webpage origin to <strong>FRAME_ANCESTORS</strong> in the server's private .env file, then restart the server.`;
  const serviceOptions = state.services.map(service =>
    `<option value="${escapeHtml(service.id)}">${escapeHtml(service.title)}</option>`
  ).join("");

  let html = `
    <div class="settings-card">
      <h2 class="section-title">Embed Your Estimator</h2>
      <p class="section-desc">Generate a secure, responsive embed for all forms or open one service directly.</p>

      <div class="form-group" style="margin-bottom: 20px;">
        <label class="form-label" for="embed-service-select">Form to embed</label>
        <select class="form-select" id="embed-service-select">
          <option value="">All service forms</option>
          ${serviceOptions}
        </select>
      </div>

      <div class="form-group" style="margin-bottom: 20px;">
        <label class="form-label">Responsive iframe code</label>
        <div class="code-block" id="iframe-code-text">${escapeHtml(iframeCode)}</div>
        <button class="btn btn-primary" style="margin-top: 14px;" onclick="copyEmbedCode()">${getIconSvg('copy')} Copy Embed Code</button>
      </div>

      <div class="embed-preview-wrap">
        <div class="form-label">Live preview</div>
        <iframe id="embed-preview" class="embed-preview" src="${escapeHtml(getEmbedUrl())}" title="Estimator embed preview" sandbox="allow-forms allow-scripts allow-same-origin" scrolling="no"></iframe>
      </div>

      <div class="info-alert" style="margin-top: 20px;">
        <div>${getIconSvg('info')}</div>
        <div>
          <strong>Embedding status:</strong> ${statusText}<br/><br/>
          <strong>GHL / webpage steps:</strong><br/>
          1. Open your GoHighLevel Funnel or Website Page Builder.<br/>
          2. Drag a <strong>Custom Code / HTML</strong> element onto your canvas.<br/>
          3. Click "Open Code Editor" and paste the code above.<br/>
          4. Save and publish. The iframe automatically follows the form's responsive height.
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
  const serviceSelect = document.getElementById("embed-service-select");
  serviceSelect?.addEventListener("change", () => updateEmbedGenerator(serviceSelect.value));
  window.removeEventListener("message", handleEmbedPreviewResize);
  window.addEventListener("message", handleEmbedPreviewResize);
}

function updateEmbedGenerator(serviceId) {
  const codeBlock = document.getElementById("iframe-code-text");
  const preview = document.getElementById("embed-preview");
  if (codeBlock) codeBlock.innerText = buildEmbedCode(serviceId);
  if (preview) {
    preview.style.height = "760px";
    preview.src = getEmbedUrl(serviceId);
  }
}

function handleEmbedPreviewResize(event) {
  const preview = document.getElementById("embed-preview");
  if (!preview || event.source !== preview.contentWindow || event.origin !== new URL(preview.src).origin) return;
  if (event.data?.type !== "automatex360:resize") return;
  const height = Number(event.data.height);
  if (Number.isFinite(height)) preview.style.height = `${Math.min(5000, Math.max(500, height))}px`;
}

async function copyEmbedCode() {
  const code = document.getElementById("iframe-code-text")?.innerText || "";
  try {
    await navigator.clipboard.writeText(code);
    showToast("Embed code copied to clipboard!");
  } catch {
    showToast("Clipboard access was blocked. Select and copy the code manually.");
  }
}

function setupEmbeddedHeightMessaging() {
  const sendHeight = () => {
    if (embedResizeFrame !== null) cancelAnimationFrame(embedResizeFrame);
    embedResizeFrame = requestAnimationFrame(() => {
      embedResizeFrame = null;
      const calculator = document.querySelector(".embed-mode .calculator-card");
      if (!calculator) return;
      const height = Math.ceil(Math.max(calculator.getBoundingClientRect().height, calculator.scrollHeight));
      if (!Number.isFinite(height) || height === lastEmbeddedHeight) return;
      lastEmbeddedHeight = height;
      window.parent.postMessage({ type: "automatex360:resize", height }, "*");
    });
  };

  window.addEventListener("load", sendHeight);
  window.addEventListener("resize", sendHeight);
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(sendHeight);
    const calculator = document.querySelector(".embed-mode .calculator-card");
    if (calculator) observer.observe(calculator);
  }
  sendHeight();
}

/* =============================================================
   ANIMATIONS & HELPER UTILITIES
   ============================================================= */

function initDashboardAnimations() {
  if (typeof gsap !== 'undefined') {
    gsap.from("#dashboardApp", {
      scale: 0.98,
      opacity: 0,
      duration: 1.0,
      ease: "power3.out"
    });
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(msg) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `${getIconSvg('check')} <span>${escapeHtml(msg)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}

/* Modal Backdrop & Keyboard Event Listeners */
document.addEventListener("click", function (e) {
  if (e.target.classList && e.target.classList.contains("modal-overlay")) {
    e.target.classList.remove("active");
  }
  document.querySelectorAll(".custom-select-container.open").forEach(el => {
    if (!el.contains(e.target)) el.classList.remove("open");
  });
});

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay.active").forEach(m => m.classList.remove("active"));
    document.querySelectorAll(".custom-select-container.open").forEach(m => m.classList.remove("open"));
  }
});

function stepPriceInput(btn, delta) {
  const wrapper = btn.closest(".input-with-prefix");
  if (!wrapper) return;
  const input = wrapper.querySelector("input[type='number']");
  if (input) {
    const currentVal = parseFloat(input.value) || 0;
    const newVal = Math.max(0, currentVal + delta);
    input.value = newVal;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/* Custom UI Select Dropdown Initializer */
function initCustomSelects() {
  document.querySelectorAll("select.form-select").forEach(select => {
    let wrapper = select.parentElement;
    if (!wrapper || !wrapper.classList.contains("custom-select-container")) {
      wrapper = document.createElement("div");
      wrapper.className = "custom-select-container";
      if (select.style.width) wrapper.style.width = select.style.width;

      select.parentNode.insertBefore(wrapper, select);
      wrapper.appendChild(select);
    }

    select.style.display = "none";

    let trigger = wrapper.querySelector(".custom-select-trigger");
    if (!trigger) {
      trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "custom-select-trigger";
      wrapper.appendChild(trigger);
    }

    const selectedOpt = select.options[select.selectedIndex] || select.options[0];
    const initialText = selectedOpt ? selectedOpt.textContent : "";

    trigger.innerHTML = `
      <span>${escapeHtml(initialText)}</span>
      <svg class="custom-select-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
    `;

    let menu = wrapper.querySelector(".custom-select-menu");
    if (menu) menu.remove();

    menu = document.createElement("div");
    menu.className = "custom-select-menu";

    Array.from(select.options).forEach(opt => {
      const item = document.createElement("div");
      item.className = `custom-select-item ${opt.selected ? 'selected' : ''}`;
      item.dataset.value = opt.value;
      item.innerHTML = `
        <span>${escapeHtml(opt.textContent)}</span>
        ${opt.selected ? '<span style="font-size: 12px; margin-left: 6px;">✓</span>' : ''}
      `;

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        select.value = opt.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        trigger.querySelector("span").textContent = opt.textContent;
        menu.querySelectorAll(".custom-select-item").forEach(i => {
          i.classList.remove("selected");
          const check = i.querySelector("span:nth-child(2)");
          if (check) check.remove();
        });
        item.classList.add("selected");
        item.insertAdjacentHTML("beforeend", '<span style="font-size: 12px; margin-left: 6px;">✓</span>');
        wrapper.classList.remove("open");
      });

      menu.appendChild(item);
    });

    wrapper.appendChild(menu);

    trigger.onclick = (e) => {
      e.stopPropagation();
      document.querySelectorAll(".custom-select-container.open").forEach(other => {
        if (other !== wrapper) other.classList.remove("open");
      });
      wrapper.classList.toggle("open");
    };
  });
}
