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