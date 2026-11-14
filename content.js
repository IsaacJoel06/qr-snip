/**
 * QR Snip - Content Script
 * Manages snipping overlay, screen coordinate cropping, local jsQR decoding,
 * context menu image scanning, security warning analysis, and the adaptive toast interface.
 */

(() => {
  // Prevent duplicate execution of event listeners if re-injected
  if (window.__qrSnipLoaded) {
    return;
  }
  window.__qrSnipLoaded = true;

  // Active state references
  let activeOverlay = null;
  let activeToast = null;
  let cachedScreenshotUrl = null;
  let lastRightClickedElement = null;

  // Track user theme preference: 'auto' (system), 'dark', or 'light'
  let currentTheme = localStorage.getItem('qr_snip_theme') || 'auto';

  // Known URL Shortener domains
  const KNOWN_SHORTENERS = new Set([
    'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'buff.ly',
    'ow.ly', 'cutt.ly', 'rebrand.ly', 'bl.ink', 'shorturl.at',
    'tiny.cc', 'clck.ru', 's.id', 'v.gd', 'trib.al', 'qr.ae',
    'rb.gy', 'lnkd.in', 'linktr.ee', 'fb.me', 'wp.me', 'amzn.to',
    'ift.tt', 'bit.do', 'mcaf.ee', 'su.pr', 'post.ly'
  ]);

  // Track the most recent right-clicked element for context menu scans
  document.addEventListener('contextmenu', (e) => {
    lastRightClickedElement = e.target;
  }, true);

  // -------------------------------------------------------------
  // Messaging & Initialization
  // -------------------------------------------------------------

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Health check from background
    if (request.action === 'PING') {
      sendResponse({ status: 'PONG' });
      return true;
    }

    // Begin drag-to-snip session
    if (request.action === 'START_SNIP' && request.screenshotUrl) {
      cachedScreenshotUrl = request.screenshotUrl;
      cleanUpOverlay();
      cleanUpToast();
      initSnippingOverlay(cachedScreenshotUrl);
      sendResponse({ status: 'OK' });
      return true;
    }

    // Direct scan from context menu: "Scan QR in this image"
    if (request.action === 'SCAN_IMAGE_DIRECT' && request.srcUrl) {
      cachedScreenshotUrl = request.screenshotUrl || null;
      cleanUpOverlay();
      cleanUpToast();
      scanImageDirect(request.srcUrl, cachedScreenshotUrl);
      sendResponse({ status: 'OK' });
      return true;
    }
  });

  // -------------------------------------------------------------
  // Snipping Overlay
  // -------------------------------------------------------------

  /**
   * Creates and attaches the dim overlay and selection handles.
   * @param {string} screenshotUrl - Base64 PNG data URL of the visible tab
   */
  function initSnippingOverlay(screenshotUrl) {
    const overlay = document.createElement('div');
    overlay.className = 'qr-snip-overlay';

    const guideBadge = document.createElement('div');
    guideBadge.className = 'qr-snip-guide-badge';
    guideBadge.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3M9 9h6v6H9z"/>
      </svg>
      <span>Drag a box over the QR code</span>
      <kbd>Esc</kbd> <span>to cancel</span>
    `;
    overlay.appendChild(guideBadge);

    const selectionBox = document.createElement('div');
    selectionBox.className = 'qr-snip-selection-box';
    selectionBox.innerHTML = `
      <div class="qr-snip-corner qr-snip-corner-tl"></div>
      <div class="qr-snip-corner qr-snip-corner-tr"></div>
      <div class="qr-snip-corner qr-snip-corner-bl"></div>
      <div class="qr-snip-corner qr-snip-corner-br"></div>
    `;
    overlay.appendChild(selectionBox);

    document.body.appendChild(overlay);
    activeOverlay = overlay;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let currentRect = { left: 0, top: 0, width: 0, height: 0 };

    function onMouseDown(e) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      currentRect = { left: startX, top: startY, width: 0, height: 0 };

      overlay.classList.add('qr-snip-dragging');
      selectionBox.style.display = 'block';
      updateSelectionStyle(selectionBox, currentRect);
    }

    function onMouseMove(e) {
      if (!isDragging) return;
      e.preventDefault();
      e.stopPropagation();

      const currentX = Math.max(0, Math.min(e.clientX, window.innerWidth));
      const currentY = Math.max(0, Math.min(e.clientY, window.innerHeight));

      currentRect.left = Math.min(startX, currentX);
      currentRect.top = Math.min(startY, currentY);
      currentRect.width = Math.abs(currentX - startX);
      currentRect.height = Math.abs(currentY - startY);

      updateSelectionStyle(selectionBox, currentRect);
    }

    function onMouseUp(e) {
      if (!isDragging) return;
      e.preventDefault();
      e.stopPropagation();

      isDragging = false;
      cleanUpOverlay();

      if (currentRect.width < 10 || currentRect.height < 10) {
        return;
      }

      processSelection(screenshotUrl, currentRect);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cleanUpOverlay();
      }
    }

    overlay.addEventListener('mousedown', onMouseDown, { capture: true });
    window.addEventListener('mousemove', onMouseMove, { capture: true });
    window.addEventListener('mouseup', onMouseUp, { capture: true });
    window.addEventListener('keydown', onKeyDown, { capture: true });

    overlay.__teardown = () => {
      overlay.removeEventListener('mousedown', onMouseDown, { capture: true });
      window.removeEventListener('mousemove', onMouseMove, { capture: true });
      window.removeEventListener('mouseup', onMouseUp, { capture: true });
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }

  function updateSelectionStyle(element, rect) {
    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.top}px`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
  }

  function cleanUpOverlay() {
    if (activeOverlay) {
      if (typeof activeOverlay.__teardown === 'function') {
        activeOverlay.__teardown();
      }
      activeOverlay.remove();
      activeOverlay = null;
    }
  }

  // -------------------------------------------------------------
  // Cropping & Decoding
  // -------------------------------------------------------------

  /**
   * Crops the user-selected area from the captured tab image,
   * accounting for devicePixelRatio and zoom, and decodes via jsQR.
   */
  async function processSelection(screenshotUrl, selection) {
    try {
      const img = new Image();
      img.src = screenshotUrl;
      await img.decode();

      const scaleX = img.naturalWidth / window.innerWidth;
      const scaleY = img.naturalHeight / window.innerHeight;

      const cropX = Math.max(0, Math.round(selection.left * scaleX));
      const cropY = Math.max(0, Math.round(selection.top * scaleY));
      const cropW = Math.min(img.naturalWidth - cropX, Math.round(selection.width * scaleX));
      const cropH = Math.min(img.naturalHeight - cropY, Math.round(selection.height * scaleY));

      if (cropW <= 0 || cropH <= 0) {
        showResultToast({ success: false });
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = cropW;
      canvas.height = cropH;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      const imageData = ctx.getImageData(0, 0, cropW, cropH);
      const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth'
      });

      if (decoded && decoded.data && decoded.data.trim().length > 0) {
        showResultToast({ success: true, text: decoded.data.trim() });
      } else {
        showResultToast({ success: false });
      }
    } catch (err) {
      console.error('[QR Snip] Error processing selection:', err);
      showResultToast({ success: false });
    }
  }

  /**
   * Scans an image element directly when triggered from context menu.
   * Tries direct canvas rendering first; falls back to viewport screenshot crop if cross-origin.
   * @param {string} srcUrl - Source URL of the image
   * @param {string|null} fallbackScreenshotUrl - Full visible tab capture
   */
  async function scanImageDirect(srcUrl, fallbackScreenshotUrl) {
    let decoded = null;

    // Method 1: Try direct image decoding onto offscreen canvas
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = srcUrl;
      await img.decode();

      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;

      if (width > 0 && height > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, width, height);
        decoded = jsQR(imgData.data, imgData.width, imgData.height, {
          inversionAttempts: 'attemptBoth'
        });
      }
    } catch {
      // Direct access may be blocked by CORS (tainted canvas)
      decoded = null;
    }

    // Method 2: Fallback to tab screenshot crop if element is visible on page
    if ((!decoded || !decoded.data) && fallbackScreenshotUrl && lastRightClickedElement) {
      try {
        const rect = lastRightClickedElement.getBoundingClientRect();
        if (rect.width > 5 && rect.height > 5) {
          const tabImg = new Image();
          tabImg.src = fallbackScreenshotUrl;
          await tabImg.decode();

          const scaleX = tabImg.naturalWidth / window.innerWidth;
          const scaleY = tabImg.naturalHeight / window.innerHeight;

          const cropX = Math.max(0, Math.round(rect.left * scaleX));
          const cropY = Math.max(0, Math.round(rect.top * scaleY));
          const cropW = Math.min(tabImg.naturalWidth - cropX, Math.round(rect.width * scaleX));
          const cropH = Math.min(tabImg.naturalHeight - cropY, Math.round(rect.height * scaleY));

          if (cropW > 0 && cropH > 0) {
            const canvas = document.createElement('canvas');
            canvas.width = cropW;
            canvas.height = cropH;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(tabImg, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

            const imgData = ctx.getImageData(0, 0, cropW, cropH);
            decoded = jsQR(imgData.data, imgData.width, imgData.height, {
              inversionAttempts: 'attemptBoth'
            });
          }
        }
      } catch (fallbackErr) {
        console.error('[QR Snip] Fallback direct image crop failed:', fallbackErr);
      }
    }

    if (decoded && decoded.data && decoded.data.trim()) {
      showResultToast({ success: true, text: decoded.data.trim() });
    } else {
      showResultToast({
        success: false,
        isDirectScan: true,
        message: 'No QR code found in this image.'
      });
    }
  }

  // -------------------------------------------------------------
  // Security Analysis & URL Inspector
  // -------------------------------------------------------------

  /**
   * Analyzes decoded text for protocols, security risks (HTTP, punycode, shorteners),
   * and blocks dangerous scripts/data URLs.
   */
  function inspectDecodedText(rawText) {
    const text = rawText.trim();
    const lower = text.toLowerCase();

    // 1. Strictly block dangerous protocols (javascript:, data:, vbscript:, file:)
    const blockedProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
    for (const proto of blockedProtocols) {
      if (lower.startsWith(proto)) {
        return {
          isBlocked: true,
          protocol: proto.replace(':', ''),
          raw: text
        };
      }
    }

    // 2. Check for URL candidate
    let candidate = text;
    if (/^www\./i.test(candidate)) {
      candidate = 'https://' + candidate;
    }

    try {
      const parsed = new URL(candidate);
      const protocol = parsed.protocol.toLowerCase();

      // Check if protocol was blocked after URL normalization
      if (blockedProtocols.includes(protocol)) {
        return {
          isBlocked: true,
          protocol: protocol.replace(':', ''),
          raw: text
        };
      }

      // Valid web link (http or https)
      if (protocol === 'http:' || protocol === 'https:') {
        const warnings = [];
        const hostname = parsed.hostname.toLowerCase();

        // Warning A: Insecure HTTP
        if (protocol === 'http:') {
          warnings.push({
            type: 'http',
            title: 'Insecure connection (HTTP)',
            description: 'Data sent to this website is not encrypted and can be intercepted.'
          });
        }

        // Warning B: Punycode or lookalike / internationalized domain
        const isPunycode = hostname.startsWith('xn--') || hostname.includes('.xn--');
        const hasHomoglyphs = /[^\u0020-\u007E]/.test(hostname) || /[\u0400-\u04FF\u0370-\u03FF]/.test(hostname);
        if (isPunycode || hasHomoglyphs) {
          warnings.push({
            type: 'punycode',
            title: 'Lookalike / Punycode domain detected',
            description: 'Uses internationalized characters (IDN) that may spoof legitimate domains.'
          });
        }

        // Warning C: Known URL Shorteners
        const isShortener = Array.from(KNOWN_SHORTENERS).some(
          (s) => hostname === s || hostname.endsWith('.' + s)
        );
        if (isShortener) {
          warnings.push({
            type: 'shortener',
            title: 'Known URL shortener detected',
            description: 'The real destination is hidden and could redirect to unexpected or harmful content.'
          });
        }

        return {
          isUrl: true,
          isBlocked: false,
          domain: parsed.hostname,
          href: parsed.href,
          warnings,
          hasWarnings: warnings.length > 0,
          raw: text
        };
      }
    } catch {
      // Not a valid URL
    }

    // 3. Plain text
    return {
      isUrl: false,
      isBlocked: false,
      raw: text
    };
  }

  // -------------------------------------------------------------
  // Clipboard & Toast UI Helpers
  // -------------------------------------------------------------

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const input = document.createElement('textarea');
      input.value = text;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.focus();
      input.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(input);
      return ok;
    }
  }

  function cleanUpToast() {
    if (activeToast) {
      if (typeof activeToast.__teardown === 'function') {
        activeToast.__teardown();
      }
      activeToast.remove();
      activeToast = null;
    }
  }

  function applyTheme(container, theme) {
    container.classList.remove('qr-theme-dark', 'qr-theme-light');
    if (theme === 'dark') {
      container.classList.add('qr-theme-dark');
    } else if (theme === 'light') {
      container.classList.add('qr-theme-light');
    }
  }

  /**
   * Displays the toast notification with decoded QR content, safety alerts, or failure feedback.
   */
  function showResultToast(result) {
    cleanUpToast();

    const container = document.createElement('div');
    container.className = 'qr-snip-toast-container';
    applyTheme(container, currentTheme);

    const card = document.createElement('div');
    card.className = 'qr-snip-toast-card';

    // Header
    const header = document.createElement('div');
    header.className = 'qr-snip-toast-header';

    const titleBox = document.createElement('div');
    titleBox.className = 'qr-snip-toast-title';
    titleBox.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3M9 9h6v6H9z"/>
      </svg>
      <span>QR Snip</span>
    `;

    const controls = document.createElement('div');
    controls.className = 'qr-snip-toast-controls';

    // Theme toggle button (switches between auto, dark, and light)
    const themeBtn = document.createElement('button');
    themeBtn.className = 'qr-snip-icon-btn';
    themeBtn.setAttribute('title', 'Toggle Dark/Light Mode');
    themeBtn.innerHTML = getThemeIcon(currentTheme);
    themeBtn.onclick = () => {
      if (currentTheme === 'auto') currentTheme = 'dark';
      else if (currentTheme === 'dark') currentTheme = 'light';
      else currentTheme = 'auto';

      localStorage.setItem('qr_snip_theme', currentTheme);
      applyTheme(container, currentTheme);
      themeBtn.innerHTML = getThemeIcon(currentTheme);
    };

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'qr-snip-icon-btn';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '✕';
    closeBtn.onclick = cleanUpToast;

    controls.appendChild(themeBtn);
    controls.appendChild(closeBtn);
    header.appendChild(titleBox);
    header.appendChild(controls);
    card.appendChild(header);

    // Body & Actions
    const body = document.createElement('div');
    body.className = 'qr-snip-toast-body';

    const actions = document.createElement('div');
    actions.className = 'qr-snip-actions';

    if (result.success && result.text) {
      const info = inspectDecodedText(result.text);

      if (info.isBlocked) {
        // --- Case 1: Dangerous Protocol Blocked (javascript:, data:) ---
        body.innerHTML = `
          <div class="qr-snip-danger-banner">
            <span class="qr-snip-danger-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
              </svg>
            </span>
            <div>
              <strong>Blocked Dangerous Link (${escapeHtml(info.protocol)}:)</strong>
              <div style="margin-top: 3px;">
                Links with <code>${escapeHtml(info.protocol)}:</code> can execute malicious scripts or load dangerous payloads and have been blocked.
              </div>
            </div>
          </div>
          <div style="margin-top: 10px;">
            <div class="qr-snip-url-full">${escapeHtml(info.raw)}</div>
          </div>
        `;

        // Only allow copying text, never opening
        const copyBtn = document.createElement('button');
        copyBtn.className = 'qr-snip-btn qr-snip-btn-secondary';
        copyBtn.innerHTML = `<span>Copy content</span>`;
        copyBtn.onclick = async () => {
          await copyText(info.raw);
          copyBtn.classList.add('qr-snip-btn-copied');
          copyBtn.innerHTML = `<span>Copied!</span>`;
          setTimeout(() => {
            copyBtn.classList.remove('qr-snip-btn-copied');
            copyBtn.innerHTML = `<span>Copy content</span>`;
          }, 2000);
        };
        actions.appendChild(copyBtn);

      } else if (info.isUrl) {
        // --- Case 2: URL Result (with safety warnings if detected) ---
        let warningHtml = '';
        if (info.hasWarnings) {
          const listItems = info.warnings
            .map((w) => `<li><strong>${escapeHtml(w.title)}:</strong> ${escapeHtml(w.description)}</li>`)
            .join('');

          warningHtml = `
            <div class="qr-snip-warning-banner">
              <span class="qr-snip-warning-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </span>
              <div>
                <strong>Security Caution:</strong>
                <ul>${listItems}</ul>
              </div>
            </div>
          `;
        }

        body.innerHTML = `
          <div class="qr-snip-url-domain">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            <strong>${escapeHtml(info.domain)}</strong>
          </div>
          <div class="qr-snip-url-full" title="${escapeHtml(info.href)}">${escapeHtml(info.href)}</div>
          ${warningHtml}
        `;

        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'qr-snip-btn qr-snip-btn-secondary';
        copyBtn.innerHTML = `<span>Copy</span>`;
        copyBtn.onclick = async () => {
          await copyText(info.href);
          copyBtn.classList.add('qr-snip-btn-copied');
          copyBtn.innerHTML = `<span>Copied!</span>`;
          setTimeout(() => {
            copyBtn.classList.remove('qr-snip-btn-copied');
            copyBtn.innerHTML = `<span>Copy</span>`;
          }, 2000);
        };

        // Open link button (Never auto-opens; user must explicitly click)
        const openBtn = document.createElement('button');
        openBtn.className = info.hasWarnings
          ? 'qr-snip-btn qr-snip-btn-warning'
          : 'qr-snip-btn qr-snip-btn-primary';

        openBtn.innerHTML = `
          <span>Open link</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        `;
        openBtn.onclick = () => {
          chrome.runtime.sendMessage({ action: 'OPEN_URL', url: info.href });
          cleanUpToast();
        };

        actions.appendChild(copyBtn);
        actions.appendChild(openBtn);

      } else {
        // --- Case 3: Plain text ---
        const textWrapper = document.createElement('div');
        textWrapper.className = 'qr-snip-text-content';
        textWrapper.textContent = result.text;
        body.appendChild(textWrapper);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'qr-snip-btn qr-snip-btn-primary';
        copyBtn.innerHTML = `<span>Copy</span>`;
        copyBtn.onclick = async () => {
          await copyText(result.text);
          copyBtn.classList.add('qr-snip-btn-copied');
          copyBtn.innerHTML = `<span>Copied!</span>`;
          setTimeout(() => {
            copyBtn.classList.remove('qr-snip-btn-copied');
            copyBtn.innerHTML = `<span>Copy</span>`;
          }, 2000);
        };
        actions.appendChild(copyBtn);
      }
    } else {
      // --- Case 4: No QR found ---
      const message = result.message || 'No QR code found, try selecting a tighter area.';
      body.innerHTML = `
        <div class="qr-snip-not-found">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>${escapeHtml(message)}</span>
        </div>
      `;

      const dismissBtn = document.createElement('button');
      dismissBtn.className = 'qr-snip-btn qr-snip-btn-secondary';
      dismissBtn.textContent = 'Dismiss';
      dismissBtn.onclick = cleanUpToast;

      const retryBtn = document.createElement('button');
      retryBtn.className = 'qr-snip-btn qr-snip-btn-primary';
      retryBtn.innerHTML = `<span>Snip Tool</span>`;
      retryBtn.onclick = () => {
        cleanUpToast();
        if (cachedScreenshotUrl) {
          initSnippingOverlay(cachedScreenshotUrl);
        } else {
          // Request fresh screenshot
          chrome.runtime.sendMessage({ action: 'REQUEST_RECAPTURE' }, (response) => {
            if (response && response.screenshotUrl) {
              cachedScreenshotUrl = response.screenshotUrl;
              initSnippingOverlay(cachedScreenshotUrl);
            }
          });
        }
      };

      actions.appendChild(dismissBtn);
      actions.appendChild(retryBtn);
    }

    card.appendChild(body);
    card.appendChild(actions);
    container.appendChild(card);
    document.body.appendChild(container);
    activeToast = container;

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        cleanUpToast();
      }
    }
    window.addEventListener('keydown', onKeyDown);

    container.__teardown = () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }

  function getThemeIcon(theme) {
    if (theme === 'dark') {
      // Moon icon
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    } else if (theme === 'light') {
      // Sun icon
      return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
    }
    // Auto / System icon (circle half filled)
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"></path></svg>`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
