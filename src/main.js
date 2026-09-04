// Font License Intelligence - Client Logic & SPA Engine

// App State
let state = {
  activePage: 'dashboard',
  extractedMetadata: null, // parsed from file
  selectedFontId: null,     // from registry or custom
  selectedFontName: '',
  searchResults: [],
  selectedCandidate: null,
  activeAuditResult: null,
  monitoredFonts: []
};

// API Base (runs through Vite dev server proxy or directly on production port)
const API_BASE = '';

// Dom Elements
const pages = {
  dashboard: document.getElementById('page-dashboard'),
  audit: document.getElementById('page-audit'),
  settings: document.getElementById('page-settings'),
  customEula: document.getElementById('page-custom-eula')
};

const navBtns = {
  dashboard: document.getElementById('btn-nav-dashboard'),
  audit: document.getElementById('btn-nav-audit'),
  settings: document.getElementById('btn-nav-settings')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupSettings();
  setupDashboard();
  setupDragAndDrop();
  setupSearch();
  setupFormHandlers();
  setupDrawer();
  setupCustomEulaPage();

  // Load Dashboard initially
  loadHistory();
});

// 1. Navigation Routing (SPA)
function setupNavigation() {
  const switchPage = (pageName) => {
    state.activePage = pageName;
    
    // Update active nav button
    Object.keys(navBtns).forEach(key => {
      if (key === pageName) {
        navBtns[key].classList.add('active');
      } else {
        navBtns[key].classList.remove('active');
      }
    });

    // Update visible page
    Object.keys(pages).forEach(key => {
      if (key === pageName) {
        pages[key].classList.add('active');
      } else {
        pages[key].classList.remove('active');
      }
    });

    // Page specific triggers
    if (pageName === 'dashboard') {
      loadHistory();
    }
  };

  navBtns.dashboard.addEventListener('click', () => switchPage('dashboard'));
  navBtns.audit.addEventListener('click', () => {
    resetAuditFlow();
    switchPage('audit');
  });
  navBtns.settings.addEventListener('click', () => switchPage('settings'));

  document.getElementById('nav-logo').addEventListener('click', () => switchPage('dashboard'));
  document.getElementById('btn-dash-new-audit').addEventListener('click', () => {
    resetAuditFlow();
    switchPage('audit');
  });
}

// 2. Settings (Gemini Key)
function setupSettings() {
  const keyInput = document.getElementById('input-gemini-key');
  const saveBtn = document.getElementById('btn-save-settings');
  const apiBadge = document.getElementById('api-status-indicator');

  // Load existing key from localStorage with sessionStorage fallback
  const storedKey = localStorage.getItem('GEMINI_API_KEY') || sessionStorage.getItem('GEMINI_API_KEY') || '';
  if (storedKey) {
    keyInput.value = storedKey;
    updateApiIndicator(true);
  }

  saveBtn.addEventListener('click', () => {
    const key = keyInput.value.trim();
    if (key) {
      localStorage.setItem('GEMINI_API_KEY', key);
      sessionStorage.setItem('GEMINI_API_KEY', key);
      updateApiIndicator(true);
      alert('Gemini API credentials saved successfully in local storage.');
    } else {
      localStorage.removeItem('GEMINI_API_KEY');
      sessionStorage.removeItem('GEMINI_API_KEY');
      updateApiIndicator(false);
      alert('API credentials removed. Local parsing fallback active.');
    }
  });

  function updateApiIndicator(isOnline) {
    if (isOnline) {
      apiBadge.className = 'api-status-badge online';
      apiBadge.innerHTML = '<span class="dot"></span> Gemini API Integration Active';
    } else {
      apiBadge.className = 'api-status-badge offline';
      apiBadge.innerHTML = '<span class="dot"></span> Local Heuristic Fallback Active';
    }
  }
}

// 3. Dashboard and Saved History
async function setupDashboard() {
  document.getElementById('btn-refresh-history').addEventListener('click', loadHistory);
  
  const checkAllBtn = document.getElementById('btn-check-all-monitored');
  if (checkAllBtn) {
    checkAllBtn.addEventListener('click', async () => {
      try {
        const response = await fetch(`${API_BASE}/api/history`);
        const history = await response.json();
        const monitoredIds = history.filter(h => h.monitored !== false).map(h => h.id);
        if (monitoredIds.length === 0) {
          alert('No fonts are currently set to monitored in your library.');
          return;
        }
        await checkMonitoredUpdates(monitoredIds, true);
      } catch (err) {
        console.error('Failed checking updates:', err);
      }
    });
  }

  document.getElementById('btn-banner-close').addEventListener('click', () => {
    document.getElementById('monitored-alerts-container').classList.add('hidden');
  });
}

async function loadHistory() {
  const tbody = document.getElementById('dashboard-fonts-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="table-empty"><div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0 auto 10px;"></div>Syncing license records...</td></tr>';

  try {
    const response = await fetch(`${API_BASE}/api/history`);
    const history = await response.json();

    // Render Stats
    document.getElementById('stat-total-fonts').textContent = history.length;
    const allowedCount = history.filter(h => h.overall_status === 'Allowed').length;
    const restrictedCount = history.filter(h => h.overall_status === 'Restricted' || h.overall_status === 'Prohibited').length;
    document.getElementById('stat-allowed-print').textContent = allowedCount;
    document.getElementById('stat-restricted-fonts').textContent = restrictedCount;

    if (history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No font audits saved. Start by checking your first font!</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    history.forEach(entry => {
      const tr = document.createElement('tr');
      
      const usesBadges = (entry.project_types || []).map(u => `<span class="meta-badge">${u}</span>`).join(' ');
      
      const statusPillClass = (entry.overall_status || 'unknown').toLowerCase();
      let statusIcon = '✅';
      if (statusPillClass === 'prohibited') statusIcon = '❌';
      else if (statusPillClass === 'restricted') statusIcon = '⚠️';
      else if (statusPillClass === 'unknown') statusIcon = '❓';

      const isMonitored = entry.monitored !== false;
      const monitorBadgeHtml = `
        <span class="monitored-badge ${isMonitored ? 'active' : 'inactive'}" data-id="${entry.id}" title="Click to toggle license monitoring">
          ${isMonitored ? '● Active' : '○ Off'}
        </span>
      `;

      const formattedDate = new Date(entry.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      tr.innerHTML = `
        <td><strong>${entry.font_name}</strong></td>
        <td><span class="info-val code">${entry.postscript_name || 'N/A'}</span></td>
        <td><span class="status-pill ${statusPillClass}">${statusIcon} ${entry.overall_status}</span></td>
        <td><div class="signals-list">${usesBadges}</div></td>
        <td>${monitorBadgeHtml}</td>
        <td>${formattedDate}</td>
        <td>
          <button class="text-btn recheck-btn" data-id="${entry.id}">Audit Detail</button>
          <button class="close-text-btn delete-btn" data-id="${entry.id}" style="margin-left: 1rem;">Delete</button>
        </td>
      `;

      // Set up click handlers
      const badgeEl = tr.querySelector('.monitored-badge');
      badgeEl.addEventListener('click', async (e) => {
        e.stopPropagation();
        const nextState = !isMonitored;
        try {
          await fetch(`${API_BASE}/api/history/${entry.id}/monitor`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monitored: nextState })
          });
          loadHistory();
        } catch (err) {
          console.error('Failed to toggle monitor:', err);
        }
      });

      tr.querySelector('.recheck-btn').addEventListener('click', () => loadSavedAudit(entry));
      tr.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Remove "${entry.font_name}" audit from your library?`)) {
          deleteAudit(entry.id);
        }
      });

      tbody.appendChild(tr);
    });

    // Check for monitored updates
    const fontIdsToWatch = history.filter(h => h.monitored !== false).map(h => h.id);
    if (fontIdsToWatch.length > 0) {
      checkMonitoredUpdates(fontIdsToWatch);
    }
  } catch (error) {
    console.error('Error loading library history:', error);
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Failed to load saved audits. Server offline.</td></tr>';
  }
}

async function deleteAudit(id) {
  try {
    const response = await fetch(`${API_BASE}/api/history/${id}`, { method: 'DELETE' });
    if (response.ok) {
      loadHistory();
    }
  } catch (error) {
    console.error('Failed to delete audit:', error);
  }
}

async function checkMonitoredUpdates(ids, explicit = false) {
  try {
    const response = await fetch(`${API_BASE}/api/check-updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fontIds: ids })
    });
    const data = await response.json();
    
    if (data.updates && data.updates.length > 0) {
      const banner = document.getElementById('monitored-alerts-container');
      const bannerText = document.getElementById('alert-banner-text');
      const firstUpdate = data.updates[0];
      
      bannerText.innerHTML = `<strong>${firstUpdate.family}</strong>: ${firstUpdate.message}`;
      banner.classList.remove('hidden');

      document.getElementById('btn-banner-recheck').onclick = () => {
        banner.classList.add('hidden');
        resetAuditFlow();
        document.getElementById('font-search-input').value = firstUpdate.family;
        pages.dashboard.classList.remove('active');
        pages.audit.classList.add('active');
        state.activePage = 'audit';
        triggerSearch(firstUpdate.family);
      };
    } else if (explicit) {
      alert('All monitored licenses verified. No terms or permissions have changed.');
    }
  } catch (err) {
    console.warn('Monitored license update check failed (offline or inactive).');
  }
}

async function loadSavedAudit(entry) {
  // Find match in our system registry
  try {
    // Navigate to report screen directly with parameters
    const project = {
      useCases: entry.project_types,
      commercial: true,
      productionMethod: entry.production_method
    };

    // Identify font candidates first
    const res = await fetch(`${API_BASE}/api/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nameQuery: entry.family })
    });
    const identification = await res.json();
    
    let fontId = null;
    if (identification.candidates && identification.candidates.length > 0) {
      fontId = identification.candidates[0].font.font_id;
    }

    if (!fontId) {
      alert(`The EULA registry does not contain terms for ${entry.family}. Re-audit to parse terms.`);
      return;
    }

    // Load results
    const evaluateRes = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fontId, project, saveToHistory: false })
    });
    const resultData = await evaluateRes.json();
    
    state.activeAuditResult = resultData;
    state.selectedFontId = fontId;
    state.selectedFontName = resultData.font.family;

    pages.dashboard.classList.remove('active');
    pages.audit.classList.add('active');
    state.activePage = 'audit';

    // Show stage 3
    showAuditStage('report');
    renderComplianceReport(resultData);

  } catch (error) {
    console.error('Error re-loading audit:', error);
    alert('Failed to reload audit details. Verify backend server connectivity.');
  }
}

// 4. Drag & Drop Font File Parser (Client Side using opentype.js)
function setupDragAndDrop() {
  const dropzone = document.getElementById('font-dropzone');
  const fileInput = document.getElementById('font-file-input');
  const browseBtn = document.getElementById('btn-browse-file');

  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      processFontFile(e.target.files[0]);
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      processFontFile(e.dataTransfer.files[0]);
    }
  });
}

function processFontFile(file) {
  const loader = document.getElementById('parse-loading');
  const metaCard = document.getElementById('extracted-metadata-card');
  const dropzone = document.getElementById('font-dropzone');

  loader.classList.remove('hidden');
  metaCard.classList.add('hidden');

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      // Use opentype.js to parse the font tables client-side
      const font = opentype.parse(e.target.result);
      
      const names = font.names;
      const getLangString = (prop) => {
        if (!names[prop]) return '';
        // prefer English
        return names[prop].en || Object.values(names[prop])[0] || '';
      };

      // Extract Vendor ID from OS/2 table
      let vendorId = 'N/A';
      if (font.tables.os2 && font.tables.os2.achVendID) {
        vendorId = font.tables.os2.achVendID;
      }

      const metadata = {
        family: getLangString('fontFamily'),
        subfamily: getLangString('fontSubfamily') || 'Regular',
        postscript_name: getLangString('postScriptName'),
        designer: getLangString('designer'),
        manufacturer: getLangString('manufacturer') || getLangString('supplier'),
        version: getLangString('version'),
        copyright: getLangString('copyright'),
        trademark: getLangString('trademark'),
        vendor_url: getLangString('vendorURL') || getLangString('manufacturerURL'),
        license_url: getLangString('licenseURL'),
        license_info: getLangString('license') || getLangString('licenseDescription'),
        vendor_id: vendorId,
        filename: file.name
      };

      state.extractedMetadata = metadata;
      displayExtractedMetadata(metadata);
      identifyFontMatches(metadata);

    } catch (err) {
      console.error('Failed to parse font file using opentype.js:', err);
      alert('Error parsing font file. Please ensure it is a valid OTF, TTF or WOFF format.');
      loader.classList.add('hidden');
    }
  };

  reader.onerror = () => {
    alert('Failed to read file.');
    loader.classList.add('hidden');
  };

  reader.readAsArrayBuffer(file);
}

function displayExtractedMetadata(meta) {
  document.getElementById('parse-loading').classList.add('hidden');
  document.getElementById('extracted-metadata-card').classList.remove('hidden');

  document.getElementById('meta-family').textContent = meta.family || 'Unknown';
  document.getElementById('meta-style').textContent = meta.subfamily || 'Regular';
  document.getElementById('meta-postscript').textContent = meta.postscript_name || 'N/A';
  document.getElementById('meta-vendor').textContent = meta.vendor_id || 'N/A';
  document.getElementById('meta-designer').textContent = meta.designer || 'Unknown';
  document.getElementById('meta-manufacturer').textContent = meta.manufacturer || 'Unknown';
  document.getElementById('meta-version').textContent = meta.version || 'Unknown';

  const trademarkEl = document.getElementById('meta-trademark');
  if (trademarkEl) trademarkEl.textContent = meta.trademark || 'None';

  const copyrightEl = document.getElementById('meta-copyright');
  if (copyrightEl) copyrightEl.textContent = meta.copyright || 'None';

  const vendorUrlEl = document.getElementById('meta-vendor-url');
  if (vendorUrlEl) {
    if (meta.vendor_url) {
      vendorUrlEl.innerHTML = `<a href="${meta.vendor_url}" target="_blank" class="text-btn truncate" style="max-width:100%;">${meta.vendor_url}</a>`;
    } else {
      vendorUrlEl.textContent = 'None';
    }
  }
  
  const licUrlText = document.getElementById('meta-lic-url');
  if (meta.license_url) {
    licUrlText.innerHTML = `<a href="${meta.license_url}" target="_blank" class="text-btn truncate" style="max-width:100%;">${meta.license_url}</a>`;
  } else if (meta.license_info) {
    licUrlText.textContent = meta.license_info;
  } else {
    licUrlText.textContent = 'None embedded';
  }

  // Set up remove button
  document.getElementById('btn-clear-extracted').onclick = () => {
    state.extractedMetadata = null;
    document.getElementById('extracted-metadata-card').classList.add('hidden');
    document.getElementById('candidates-verification-panel').classList.add('hidden');
    document.getElementById('font-file-input').value = '';
    updateStage1NextButton();
  };
}

async function identifyFontMatches(metadata) {
  try {
    const res = await fetch(`${API_BASE}/api/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata)
    });
    const data = await res.json();
    renderVerificationCandidates(data.candidates);
  } catch (error) {
    console.error('Failed to run identification on backend:', error);
  }
}

// 5. Search Font by Name
function setupSearch() {
  const searchInput = document.getElementById('font-search-input');
  const searchBtn = document.getElementById('btn-search-font');

  searchBtn.addEventListener('click', () => {
    const query = searchInput.value.trim();
    if (query) {
      triggerSearch(query);
    }
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const query = searchInput.value.trim();
      if (query) triggerSearch(query);
    }
  });
}

async function triggerSearch(query) {
  const resultsBox = document.getElementById('search-results-box');
  const list = document.getElementById('search-candidates-list');

  resultsBox.classList.remove('hidden');
  list.innerHTML = '<li>Searching font library...</li>';

  try {
    const response = await fetch(`${API_BASE}/api/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nameQuery: query })
    });
    const data = await response.json();
    
    list.innerHTML = '';
    if (data.candidates.length === 0) {
      list.innerHTML = `<li style="cursor:default;flex-direction:column;align-items:flex-start;gap:0.50rem;">
        <span>No matches found in standard registry.</span>
        <button class="action-btn outline-btn" id="btn-search-trigger-custom" style="padding: 0.4rem 0.8rem; font-size:0.8rem;">Create & Parse Custom License</button>
      </li>`;
      
      document.getElementById('btn-search-trigger-custom').onclick = () => {
        openCustomEulaEditor({ family: query });
      };
      
      document.getElementById('candidates-verification-panel').classList.add('hidden');
      return;
    }

    data.candidates.forEach(cand => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="candidate-name">${cand.font.family} <span style="font-size:0.8rem;font-weight:normal;color:var(--text-secondary)">(${cand.font.foundry})</span></span>
        <span class="candidate-match-score">${cand.reasons[0]}</span>
      `;
      li.onclick = () => {
        // Select it
        state.selectedCandidate = cand;
        renderVerificationCandidates([cand]);
      };
      list.appendChild(li);
    });

  } catch (error) {
    list.innerHTML = '<li>Error loading search results.</li>';
  }
}

// 6. Candidates Verification Grid
function renderVerificationCandidates(candidates) {
  const panel = document.getElementById('candidates-verification-panel');
  const grid = document.getElementById('candidates-match-list');

  panel.classList.remove('hidden');
  grid.innerHTML = '';

  if (candidates.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: span 3; text-align:center; padding: 1.5rem 0; color:var(--text-secondary);">
        No matching EULA in registry for this typeface.
      </div>
    `;
    updateStage1NextButton();
    return;
  }

  candidates.forEach((cand, idx) => {
    const card = document.createElement('div');
    card.className = `candidate-option-card ${idx === 0 ? 'selected' : ''}`;
    
    if (idx === 0) {
      state.selectedFontId = cand.font.font_id;
      state.selectedFontName = cand.font.family;
      updateStage1NextButton();
    }

    const reasonsTags = cand.reasons.map(r => `<span class="signal-tag">${r}</span>`).join(' ');

    card.innerHTML = `
      <h4>${cand.font.family}</h4>
      <div class="foundry-lbl">Foundry: ${cand.font.foundry} | Designer: ${cand.font.designer}</div>
      <div class="signals-list">
        ${reasonsTags}
      </div>
    `;

    card.onclick = () => {
      // Toggle selection styling
      grid.querySelectorAll('.candidate-option-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      
      state.selectedFontId = cand.font.font_id;
      state.selectedFontName = cand.font.family;
      updateStage1NextButton();
    };

    grid.appendChild(card);
  });
}

function updateStage1NextButton() {
  const nextBtn = document.getElementById('btn-stage1-next');
  if (state.selectedFontId) {
    nextBtn.classList.remove('disabled');
    nextBtn.removeAttribute('disabled');
  } else {
    nextBtn.classList.add('disabled');
    nextBtn.setAttribute('disabled', 'true');
  }
}

// 7. Navigation Actions within flow
function setupFormHandlers() {
  const stage1Next = document.getElementById('btn-stage1-next');
  const stage2Prev = document.getElementById('btn-stage2-prev');
  const stage2Next = document.getElementById('btn-stage2-next');
  
  const reportBack = document.getElementById('btn-report-back');
  const reportRestart = document.getElementById('btn-report-restart');

  stage1Next.addEventListener('click', () => {
    if (!state.selectedFontId) return;
    showAuditStage('use');
  });

  stage2Prev.addEventListener('click', () => {
    showAuditStage('identify');
  });

  stage2Next.addEventListener('click', () => {
    generateComplianceReport();
  });

  reportBack.addEventListener('click', () => {
    showAuditStage('use');
  });

  reportRestart.addEventListener('click', () => {
    resetAuditFlow();
    showAuditStage('identify');
  });

  // Watch for paperback checklist toggle to show/hide printer config box
  const checkboxes = document.querySelectorAll('#use-cases-checkboxes input');
  const pbCheckbox = Array.from(checkboxes).find(cb => cb.value === 'Paperback / printed book');
  const prodSettingBox = document.getElementById('production-setting-box');

  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      if (pbCheckbox.checked) {
        prodSettingBox.style.display = 'block';
      } else {
        prodSettingBox.style.display = 'none';
      }
    });
  });
}

function showAuditStage(stageName) {
  const stage1 = document.getElementById('audit-stage-identify');
  const stage2 = document.getElementById('audit-stage-use');
  const stage3 = document.getElementById('audit-stage-report');

  const ind1 = document.getElementById('step-1-indicator');
  const ind2 = document.getElementById('step-2-indicator');
  const ind3 = document.getElementById('step-3-indicator');

  [stage1, stage2, stage3].forEach(s => s.classList.remove('active'));
  [ind1, ind2, ind3].forEach(i => i.classList.remove('active'));

  if (stageName === 'identify') {
    stage1.classList.add('active');
    ind1.classList.add('active');
  } else if (stageName === 'use') {
    stage2.classList.add('active');
    ind2.classList.add('active');
  } else if (stageName === 'report') {
    stage3.classList.add('active');
    ind3.classList.add('active');
  }
}

function resetAuditFlow() {
  state.extractedMetadata = null;
  state.selectedFontId = null;
  state.selectedFontName = '';
  state.selectedCandidate = null;
  state.activeAuditResult = null;

  document.getElementById('font-search-input').value = '';
  document.getElementById('font-file-input').value = '';
  document.getElementById('search-results-box').classList.add('hidden');
  document.getElementById('extracted-metadata-card').classList.add('hidden');
  document.getElementById('candidates-verification-panel').classList.add('hidden');

  updateStage1NextButton();
  showAuditStage('identify');
}

// 8. EULA Analysis and compliance report generation
async function generateComplianceReport() {
  const checkboxes = document.querySelectorAll('#use-cases-checkboxes input');
  const selectedUses = Array.from(checkboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.value);

  if (selectedUses.length === 0) {
    alert('Please select at least one intended project use.');
    return;
  }

  const isCommercial = document.getElementById('project-commercial-toggle').checked;
  const productionMethod = document.getElementById('project-production-select').value;

  const projectProfile = {
    useCases: selectedUses,
    commercial: isCommercial,
    productionMethod
  };

  try {
    const response = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fontId: state.selectedFontId,
        project: projectProfile,
        saveToHistory: false // Only save to DB when user clicks "Add to library"
      })
    });

    const result = await response.json();
    state.activeAuditResult = result;

    showAuditStage('report');
    renderComplianceReport(result);

  } catch (error) {
    console.error('Compliance generation failed:', error);
    alert('Failed to evaluate font license terms. Check backend API logs.');
  }
}

function renderComplianceReport(data) {
  const { font, license, assessment } = data;
  
  // Set details
  document.getElementById('report-font-subtitle').textContent = `${font.foundry} — ${font.family}`;
  
  const isPaperbackSelected = assessment.paperbackChecklist !== null;
  const paperbackTitle = isPaperbackSelected ? 'paperback' : assessment.restrictionsTable[0]?.area.toLowerCase() || 'project';
  document.getElementById('report-title-text').textContent = `Can I use this font for my ${paperbackTitle}?`;

  // Render Overall Shield
  const shieldCont = document.getElementById('report-shield-container');
  const shieldBadge = document.getElementById('report-shield-badge');
  const overallText = document.getElementById('report-overall-status');
  const overallDesc = document.getElementById('report-overall-desc');

  shieldCont.className = `shield-container ${assessment.overallStatus.toLowerCase()}`;
  overallText.textContent = assessment.overallStatus;
  overallDesc.textContent = assessment.overallDescription;

  if (assessment.overallStatus === 'Allowed') {
    shieldBadge.textContent = '✅';
  } else if (assessment.overallStatus === 'Restricted') {
    shieldBadge.textContent = '⚠️';
  } else if (assessment.overallStatus === 'Prohibited') {
    shieldBadge.textContent = '❌';
  } else {
    shieldBadge.textContent = '❓';
  }

  // Save to database trigger
  const saveBtn = document.getElementById('btn-report-save-db');
  saveBtn.className = 'action-btn outline-btn';
  saveBtn.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"></path><path d="M12 9v6m-3-3h6"></path></svg> Add to My Library`;
  saveBtn.disabled = false;
  
  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saved to Library';
    
    // Perform POST to backend with history save flag
    try {
      const checkboxes = document.querySelectorAll('#use-cases-checkboxes input');
      const selectedUses = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
      const isCommercial = document.getElementById('project-commercial-toggle').checked;
      const productionMethod = document.getElementById('project-production-select').value;
      const isMonitored = document.getElementById('license-watch-toggle') ? document.getElementById('license-watch-toggle').checked : true;

      await fetch(`${API_BASE}/api/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          font_name: font.family,
          family: font.family,
          postscript_name: font.postscript_name,
          project_types: selectedUses,
          production_method: productionMethod,
          overall_status: assessment.overallStatus,
          monitored: isMonitored,
          license_version: license ? (license.effective_date || '1.0') : '1.0',
          document_hash: license ? (license.document_hash || '') : '',
          checked_date: new Date().toISOString().split('T')[0]
        })
      });
    } catch (err) {
      console.error('Failed to save to history:', err);
    }
  };

  // Export Certificate trigger
  const exportCertBtn = document.getElementById('btn-report-export-cert');
  if (exportCertBtn) {
    exportCertBtn.onclick = () => {
      window.print();
    };
  }

  // Render Paperback checklist if selected
  const pbPanel = document.getElementById('report-paperback-panel');
  const pbList = document.getElementById('paperback-checklist-items');
  
  if (isPaperbackSelected) {
    pbPanel.style.display = 'block';
    pbList.innerHTML = '';
    
    assessment.paperbackChecklist.forEach(item => {
      const box = document.createElement('div');
      box.className = 'checklist-item';
      
      const badgeClass = item.status === '✅' ? 'allowed' : (item.status === '❌' ? 'prohibited' : 'restricted');
      const evidenceBtnHtml = item.clauseId 
        ? `<a href="#" class="chk-evidence-lnk" data-clause-id="${item.clauseId}">View EULA quote</a>`
        : '';

      box.innerHTML = `
        <span class="chk-badge">${item.status}</span>
        <div class="chk-content">
          <h4>${item.question}</h4>
          <p>${item.note}</p>
          ${evidenceBtnHtml}
        </div>
      `;

      if (item.clauseId) {
        box.querySelector('.chk-evidence-lnk').addEventListener('click', (e) => {
          e.preventDefault();
          openEvidenceDrawer(item.clauseId);
        });
      }

      pbList.appendChild(box);
    });
  } else {
    pbPanel.style.display = 'none';
  }

  // Render Restrictions Table
  const tbody = document.getElementById('report-restrictions-tbody');
  tbody.innerHTML = '';

  assessment.restrictionsTable.forEach(row => {
    const tr = document.createElement('tr');
    const statusPillClass = row.status.toLowerCase().replace(/[^a-z]/g, '');
    
    let statusIcon = '✅';
    if (statusPillClass === 'prohibited') statusIcon = '❌';
    else if (statusPillClass === 'restricted') statusIcon = '⚠️';
    else if (statusPillClass === 'notspecified') statusIcon = '❓';
    else if (statusPillClass === 'unknown') statusIcon = '❓';
    
    const evidenceText = row.clauseId ? `§ ${row.section}` : 'Not Specified';

    tr.innerHTML = `
      <td><strong>${row.area}</strong></td>
      <td><span class="status-pill ${statusPillClass}">${statusIcon} ${row.status}</span></td>
      <td>
        ${row.clauseId ? `<a href="#" class="text-btn view-clause-lnk" data-clause-id="${row.clauseId}">${evidenceText}</a>` : `<span style="color:var(--text-muted)">${evidenceText}</span>`}
      </td>
    `;

    if (row.clauseId) {
      tr.addEventListener('click', () => openEvidenceDrawer(row.clauseId));
      tr.querySelector('.view-clause-lnk').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        openEvidenceDrawer(row.clauseId);
      });
    }

    tbody.appendChild(tr);
  });

  // Render Sidebar Info
  const confCard = document.getElementById('confidence-card-box');
  const confIndicator = document.getElementById('report-confidence-indicator');
  const confDesc = document.getElementById('report-confidence-desc');

  confCard.className = `sidebar-card status-box ${license ? license.confidence.toLowerCase() : 'unknown'}`;
  confIndicator.textContent = license ? license.confidence : 'Unknown';

  if (!license) {
    confDesc.textContent = 'No license could be resolved for this font in the registry.';
    document.getElementById('report-lic-title').textContent = 'N/A';
    document.getElementById('report-lic-type').textContent = 'N/A';
    document.getElementById('report-lic-checked').textContent = 'N/A';
    document.getElementById('report-lic-version').textContent = 'N/A';
    document.getElementById('report-lic-url-link').textContent = 'N/A';
    document.getElementById('report-lic-hash').textContent = 'N/A';
  } else {
    if (license.confidence === 'High') {
      confDesc.textContent = 'Primary EULA document sourced. Exact matching identifiers matched successfully.';
    } else if (license.confidence === 'Medium') {
      confDesc.textContent = 'Terms retrieved from standard registry matches. High alignment with metadata details.';
    } else {
      confDesc.textContent = 'Terms parsed from unofficial secondary summaries or forum quotes. Higher liability risk.';
    }

    document.getElementById('report-lic-title').textContent = license.license_name;
    document.getElementById('report-lic-type').textContent = license.license_type;
    
    const formattedChecked = new Date(license.retrieved_at).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric'
    });
    document.getElementById('report-lic-checked').textContent = formattedChecked;
    document.getElementById('report-lic-version').textContent = 'v' + font.version.replace(/[^\d.]/g, '') || '1.0';
    
    const urlLnk = document.getElementById('report-lic-url-link');
    urlLnk.textContent = license.source_url;
    urlLnk.href = license.source_url;

    document.getElementById('report-lic-hash').textContent = license.document_hash.substring(0, 12);
  }
}

// 9. Evidence Slide-Out Sidebar Drawer
function setupDrawer() {
  const drawer = document.getElementById('evidence-drawer');
  const overlay = document.getElementById('drawer-overlay');
  const closeBtn = document.getElementById('btn-close-drawer');

  const closeDrawer = () => {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  };

  closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
}

function openEvidenceDrawer(clauseId) {
  if (!state.activeAuditResult) return;
  
  const { license, assessment } = state.activeAuditResult;
  
  // Find matching clause from restrictionsTable row
  const row = assessment.restrictionsTable.find(r => r.clauseId === clauseId);
  if (!row) return;

  const drawer = document.getElementById('evidence-drawer');
  const overlay = document.getElementById('drawer-overlay');

  // Fill in drawer fields
  document.getElementById('drawer-tag-area').textContent = row.area;
  document.getElementById('drawer-title').textContent = `License evidence`;

  const statusBadge = document.getElementById('drawer-status-badge');
  statusBadge.className = `drawer-status-val ${row.status.toLowerCase().replace(/[^a-z]/g, '')}`;
  statusBadge.textContent = row.status;

  document.getElementById('drawer-verbatim-text').textContent = `"${row.text}"`;
  document.getElementById('drawer-section-reference').textContent = row.section;
  
  const sourceLnk = document.getElementById('drawer-source-link');
  if (license && license.source_url) {
    sourceLnk.href = license.source_url;
    sourceLnk.style.display = 'inline-flex';
    sourceLnk.textContent = `View Source: ${license.license_name} ↗`;
  } else {
    sourceLnk.style.display = 'none';
  }

  document.getElementById('drawer-interpretation-text').textContent = row.explanation;

  const tier = document.getElementById('drawer-source-tier');
  const tierDesc = document.getElementById('drawer-source-desc');
  const sourceCard = tier ? tier.closest('.source-card') : null;

  if (tier) tier.className = 'source-tier';
  if (sourceCard) sourceCard.className = 'source-card';
  const existingWarning = document.getElementById('drawer-tier4-warning');
  if (existingWarning) existingWarning.remove();

  if (license && license.source_type === 'Primary') {
    tier.textContent = 'Tier 1 — Primary Source';
    tier.style.color = 'var(--color-allowed)';
    tierDesc.textContent = 'Direct licensing agreement from the font designer or foundry company. Verbatim clauses hold highest legal validity.';
  } else if (license && license.source_type === 'Secondary') {
    tier.textContent = 'Tier 2 — Authoritative Secondary';
    tier.style.color = 'var(--color-restricted)';
    tierDesc.textContent = 'Sourced from distributor registries (e.g. MyFonts, Fonts.com) or official marketplace documentation. High reliability.';
  } else if (license && (license.source_type === 'Weak' || license.source_type === 'Tier 4' || license.source_type === 'Forum')) {
    tier.textContent = 'Tier 4 — Weak Evidence';
    tier.className = 'source-tier tier-4';
    if (sourceCard) sourceCard.className = 'source-card tier-4';
    tier.style.color = 'var(--color-prohibited)';
    tierDesc.textContent = 'Terms gathered from forum posts, Reddit discussions, or unverified blog commentary. Lowest legal reliability.';

    if (sourceCard) {
      const warningEl = document.createElement('div');
      warningEl.id = 'drawer-tier4-warning';
      warningEl.className = 'source-warning-note';
      warningEl.textContent = '⚠️ Caution: This assessment relies on informal secondary evidence. Obtain an official EULA before commercial publication.';
      sourceCard.appendChild(warningEl);
    }
  } else {
    tier.textContent = 'Tier 3 — Informational Summary';
    tier.style.color = 'var(--color-unknown)';
    tierDesc.textContent = 'Compiled from community font databases or indirect EULA summaries. Subject to translation inconsistencies.';
  }

  // Open drawer
  drawer.classList.add('open');
  overlay.classList.add('open');
}

// 10. Custom pasted EULA flow
function setupCustomEulaPage() {
  document.getElementById('btn-trigger-custom-eula').onclick = () => {
    // Collect font metadata if any
    const metadata = state.extractedMetadata || { family: 'Custom Font' };
    openCustomEulaEditor(metadata);
  };

  document.getElementById('btn-custom-cancel').onclick = () => {
    pages.customEula.classList.remove('active');
    pages.audit.classList.add('active');
    state.activePage = 'audit';
  };

  document.getElementById('btn-custom-analyze').onclick = triggerCustomEulaAnalysis;
}

function openCustomEulaEditor(metadata) {
  // Hide audit page, show custom eula page
  pages.audit.classList.remove('active');
  pages.customEula.classList.add('active');
  state.activePage = 'customEula';

  document.getElementById('custom-eula-font-name').textContent = `${metadata.family} ${metadata.subfamily || 'Regular'}`;
  document.getElementById('input-license-title').value = `${metadata.family} End User License Agreement`;
  document.getElementById('input-license-source').value = metadata.license_url || '';
  document.getElementById('input-eula-textarea').value = '';
}

async function triggerCustomEulaAnalysis() {
  const eulaText = document.getElementById('input-eula-textarea').value.trim();
  const licenseName = document.getElementById('input-license-title').value.trim();
  const sourceUrl = document.getElementById('input-license-source').value.trim();

  if (!eulaText) {
    alert('Please paste the license terms/EULA document text first.');
    return;
  }

  const loader = document.getElementById('custom-analysis-loading');
  loader.classList.remove('hidden');

  const metadata = state.extractedMetadata || {
    family: document.getElementById('input-license-title').value.replace('End User License Agreement', '').trim() || 'Custom Font',
    subfamily: 'Regular',
    postscript_name: 'CustomFont',
    vendor_id: 'CUST',
    version: '1.0'
  };

  // Checkbox inputs
  const checkboxes = document.querySelectorAll('#use-cases-checkboxes input');
  const selectedUses = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
  const isCommercial = document.getElementById('project-commercial-toggle').checked;
  const productionMethod = document.getElementById('project-production-select').value;

  const project = {
    useCases: selectedUses,
    commercial: isCommercial,
    productionMethod
  };

  const apiKey = sessionStorage.getItem('GEMINI_API_KEY');

  try {
    const response = await fetch(`${API_BASE}/api/custom-license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fontMetadata: metadata,
        eulaText,
        licenseName,
        sourceUrl,
        project,
        saveToHistory: false
      })
    });

    const result = await response.json();
    state.activeAuditResult = result;
    state.selectedFontId = result.font.font_id;
    state.selectedFontName = result.font.family;

    // Switch view back to report
    loader.classList.add('hidden');
    pages.customEula.classList.remove('active');
    pages.audit.classList.add('active');
    state.activePage = 'audit';

    showAuditStage('report');
    renderComplianceReport(result);

  } catch (error) {
    loader.classList.add('hidden');
    console.error('Custom license analysis failed:', error);
    alert('Analysis failed. Verify network connectivity.');
  }
}
