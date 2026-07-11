/**
 * ContextScanner.js
 * Scans the host application's live DOM and builds a rich AppContext snapshot.
 * This snapshot is sent to the LLM alongside each user prompt so the agent
 * has awareness of the current application state.
 */

  // Network Interceptor for Agentic UI
  const interceptedData = [];
  const MAX_INTERCEPTS = 5;

  function truncateArray(arr, maxLen) {
    if (!Array.isArray(arr)) return arr;
    if (arr.length <= maxLen) return arr;
    const truncated = arr.slice(0, maxLen);
    truncated.push({ _omitted: arr.length - maxLen + ' more items...' });
    return truncated;
  }

  function sanitizePayload(obj) {
    if (Array.isArray(obj)) return truncateArray(obj, 50);
    if (typeof obj === 'object' && obj !== null) {
      const copy = {};
      for (const key in obj) {
        if (Array.isArray(obj[key])) {
          copy[key] = truncateArray(obj[key], 50);
        } else {
          copy[key] = obj[key]; // shallow copy for simplicity
        }
      }
      return copy;
    }
    return obj;
  }

  function recordNetworkResponse(url, data) {
    // Ignore our own api calls
    if (url.includes('/api/agentic-ui')) return;
    try {
      const safeData = sanitizePayload(data);
      interceptedData.push({ url, data: safeData, timestamp: Date.now() });
      if (interceptedData.length > MAX_INTERCEPTS) {
        interceptedData.shift();
      }
    } catch (e) {
      // safe fail
    }
  }

  // Setup overrides once
  if (!window.__agui_network_patched) {
    window.__agui_network_patched = true;

    // Patch Fetch
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this, args);
      const clone = response.clone();
      clone.json().then(data => {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || 'unknown');
        recordNetworkResponse(url, data);
      }).catch(() => {});
      return response;
    };

    // Patch XHR
    const originalXHR = window.XMLHttpRequest;
    function PatchedXHR() {
      const xhr = new originalXHR();
      xhr.addEventListener('load', function() {
        try {
          if (xhr.responseType === '' || xhr.responseType === 'text' || xhr.responseType === 'json') {
            const data = typeof xhr.response === 'string' ? JSON.parse(xhr.responseText) : xhr.response;
            if (data) {
               recordNetworkResponse(xhr.responseURL || 'xhr', data);
            }
          }
        } catch (e) {}
      });
      return xhr;
    }
    window.XMLHttpRequest = PatchedXHR;
  }

const KPI_SELECTORS = [
  '[id*="kpi"]', '[class*="kpi"]',
  '[id*="metric"]', '[class*="metric"]',
  '[id*="stat"]', '[class*="stat"]',
  '[id*="card"]', '[class*="card"]',
  '[id*="value"]', '[class*="value"]',
];

const CHART_SELECTORS = [
  '[id*="chart"]', '[class*="chart"]',
  '[id*="graph"]', '[class*="graph"]',
  '[id*="plot"]', '[class*="plot"]',
];

function getText(el) {
  return (el?.textContent ?? '').trim().replace(/\s+/g, ' ');
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function extractLabel(el) {
  // Try common label patterns: aria-label, title, data-label, sibling/child with label-like text
  const aria = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-label');
  if (aria) return aria.trim();

  // Look for a child element that appears to be a label (small, muted text)
  const labelTags = ['label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'div'];
  for (const tag of labelTags) {
    const child = el.querySelector(tag);
    if (child) {
      const txt = getText(child);
      if (txt && txt.length < 60) return txt;
    }
  }

  return truncate(getText(el), 40);
}

class ContextScanner {
  constructor() {
    this._cache = null;
    this._cacheTime = 0;
    this._cacheTtl = 5000; // 5 seconds
  }

  /** Extracts page metadata */
  _getPageMeta() {
    return {
      url: window.location.href,
      title: document.title || '',
      pathname: window.location.pathname,
    };
  }

  /** Finds and extracts all <table> elements */
  _getTables() {
    const tables = [];
    const tableEls = document.querySelectorAll('table');

    tableEls.forEach((table, idx) => {
      try {
        const id = table.id || table.getAttribute('data-id') || `table_${idx}`;
        const caption = getText(table.querySelector('caption'));

        // Extract headers from thead > tr > th
        const headerRow = table.querySelector('thead tr');
        const headers = headerRow
          ? Array.from(headerRow.querySelectorAll('th, td')).map(getText)
          : [];

        // Extract body rows (up to 20)
        const bodyRows = table.querySelectorAll('tbody tr');
        const rows = Array.from(bodyRows)
          .slice(0, 20)
          .map((tr) => Array.from(tr.querySelectorAll('td, th')).map(getText));

        tables.push({ id, caption, headers, rows, rowCount: bodyRows.length });
      } catch (_) {
        // Skip malformed tables
      }
    });

    return tables;
  }

  /** Finds KPI/metric elements and extracts label+value pairs */
  _getKpis() {
    const seen = new Set();
    const kpis = [];

    const selectorStr = KPI_SELECTORS.join(',');
    let candidates = [];
    try {
      candidates = Array.from(document.querySelectorAll(selectorStr));
    } catch (_) {
      return kpis;
    }

    for (const el of candidates) {
      if (seen.has(el)) continue;
      seen.add(el);

      // Skip containers that hold many KPIs (avoid duplicates)
      const childKpis = el.querySelectorAll(selectorStr);
      if (childKpis.length > 2) continue;

      const text = getText(el);
      if (!text || text.length > 200) continue;

      // Try to find a numeric value within the element
      const numMatch = text.match(/[\$£€]?[\d,]+\.?\d*[KkMmBb%]?/);
      if (!numMatch) continue;

      const label = extractLabel(el);
      const value = numMatch[0];

      if (label && value && !kpis.find((k) => k.label === label)) {
        kpis.push({ label: truncate(label, 50), value });
      }

      if (kpis.length >= 20) break;
    }

    return kpis;
  }

  /** Finds chart/graph elements */
  _getCharts() {
    const charts = [];
    const selectorStr = CHART_SELECTORS.join(',');
    let candidates = [];
    try {
      candidates = Array.from(document.querySelectorAll(selectorStr));
    } catch (_) {
      return charts;
    }

    for (const el of candidates) {
      const id = el.id || el.getAttribute('data-id') || null;
      const label = el.getAttribute('aria-label') || el.getAttribute('title') || id || null;
      const tag = el.tagName.toLowerCase();
      charts.push({ id, label, tag });
      if (charts.length >= 10) break;
    }

    return charts;
  }

  /** Checks window.__agenticUI for registered data providers */
  _getDataProviderNames() {
    try {
      const providers = window.__agenticUI?.dataProviders;
      if (providers && typeof providers === 'object') {
        return Object.keys(providers);
      }
    } catch (_) {}
    return [];
  }

  /** Calls all registered data providers and collects results */
  async _callDataProviders() {
    const data = {};
    try {
      const providers = window.__agenticUI?.dataProviders;
      if (!providers || typeof providers !== 'object') return data;

      const keys = Object.keys(providers);
      await Promise.all(
        keys.map(async (key) => {
          try {
            const fn = providers[key];
            if (typeof fn === 'function') {
              const result = await fn();
              data[key] = result;
            }
          } catch (err) {
            data[key] = { error: err.message };
          }
        })
      );
    } catch (_) {}
    return data;
  }

  /** Main scan method — returns full AppContext snapshot */
  async scan() {
    const now = Date.now();
    if (this._cache && now - this._cacheTime < this._cacheTtl) {
      return this._cache;
    }

    const meta = this._getPageMeta();
    const tables = this._getTables();
    const kpis = this._getKpis();
    const charts = this._getCharts();
    const dataProviderNames = this._getDataProviderNames();
    const data = await this._callDataProviders();

    const context = {
      url: meta.url,
      title: meta.title,
      pathname: meta.pathname,
      kpis,
      tables,
      charts,
      dataProviders: dataProviderNames,
      data,
      networkData: interceptedData,
    };

    this._cache = context;
    this._cacheTime = now;
    return context;
  }

  /** Returns a compact string summary for the LLM prompt (max ~800 chars) */
  getContextSummary(context) {
    if (!context) return '';

    const parts = [];

    parts.push(`Page: "${truncate(context.title, 60)}" (${context.pathname})`);

    if (context.kpis?.length) {
      const kpiStr = context.kpis
        .slice(0, 6)
        .map((k) => `${k.label}: ${k.value}`)
        .join(', ');
      parts.push(`KPIs: ${kpiStr}`);
    }

    if (context.tables?.length) {
      const tableStr = context.tables
        .slice(0, 3)
        .map((t) => `${t.id}(cols: ${t.headers.slice(0, 5).join('|')}, rows: ${t.rowCount})`)
        .join('; ');
      parts.push(`Tables: ${tableStr}`);
    }

    if (context.charts?.length) {
      const chartStr = context.charts
        .slice(0, 5)
        .map((c) => c.label || c.id || c.tag)
        .join(', ');
      parts.push(`Charts: ${chartStr}`);
    }

    if (context.dataProviders?.length) {
      parts.push(`DataProviders: ${context.dataProviders.join(', ')}`);
    }

    if (context.data && Object.keys(context.data).length) {
      const dataStr = Object.entries(context.data)
        .slice(0, 3)
        .map(([k, v]) => {
          const preview = Array.isArray(v)
            ? `[${v.length} items]`
            : typeof v === 'object'
            ? JSON.stringify(v).slice(0, 80)
            : String(v).slice(0, 80);
          return `${k}: ${preview}`;
        })
        .join('; ');
      parts.push(`Data: ${dataStr}`);
    }

        if (context.networkData?.length) {
      const netStr = context.networkData
        .map(n => API(\): \)
        .join('; ');
      parts.push(Recent API Payloads: \);
    }

    return truncate(parts.join('\n'), 1500); // Expanded from 800 to 1500 to fit network data
  }
}

export default ContextScanner;
