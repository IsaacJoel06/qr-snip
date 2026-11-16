/**
 * QR Snip - Content Script (Manifest V3 - Cross-Browser)
 * Compatible with Chrome, Edge, and Firefox.
 * Manages snipping overlay, screen coordinate cropping, local jsQR decoding,
 * context menu image scanning, security warning analysis, and the adaptive toast interface.
 * All DOM nodes are built safely without innerHTML / outerHTML / insertAdjacentHTML.
 */

(() => {
  // Prevent duplicate execution of event listeners if re-injected
  if (window.__qrSnipLoaded) {
    return;
  }
  window.__qrSnipLoaded = true;

  // Cross-browser WebExtension API shim
  const api = globalThis.browser ?? globalThis.chrome;

  // Active state references
  let activeOverlay = null;
  let activeToast = null;
  let cachedScreenshotUrl = null;
  let lastRightClickedElement = null;

  // -------------------------------------------------------------
  // Safe Storage Helper
  // -------------------------------------------------------------

  function getStoredTheme() {
    try {
      return typeof window !== 'undefined' && window.localStorage
        ? window.localStorage.getItem('qr_snip_theme') || 'auto'
        : 'auto';
    } catch {
      return 'auto';
    }
  }

  function setStoredTheme(theme) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('qr_snip_theme', theme);
      }
    } catch {
      // Gracefully ignore storage write failures
    }
  }

  let currentTheme = getStoredTheme();

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
  // Safe SVG Element Builders (No innerHTML)
  // -------------------------------------------------------------

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function createSvg(width, height, viewBox = '0 0 24 24', stroke = 'currentColor', fill = 'none') {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('fill', fill);
    svg.setAttribute('stroke', stroke);
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    return svg;
  }

  function createQrTargetSvg(width, height, stroke = 'currentColor') {
    const svg = createSvg(width, height, '0 0 24 24', stroke);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3M9 9h6v6H9z');
    svg.appendChild(path);
    return svg;
  }

  function createGlobeSvg() {
    const svg = createSvg(15, 15);
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '10');
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', '2');
    line.setAttribute('y1', '12');
    line.setAttribute('x2', '22');
    line.setAttribute('y2', '12');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z');
    svg.appendChild(circle);
    svg.appendChild(line);
    svg.appendChild(path);
    return svg;
  }

  function createExternalLinkSvg() {
    const svg = createSvg(13, 13);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6');
    const polyline = document.createElementNS(SVG_NS, 'polyline');
    polyline.setAttribute('points', '15 3 21 3 21 9');
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', '10');
    line.setAttribute('y1', '14');
    line.setAttribute('x2', '21');
    line.setAttribute('y2', '3');
    svg.appendChild(path);
    svg.appendChild(polyline);
    svg.appendChild(line);
    return svg;
  }

  function createWarningTriangleSvg() {
    const svg = createSvg(18, 18);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z');
    const line1 = document.createElementNS(SVG_NS, 'line');
    line1.setAttribute('x1', '12');
    line1.setAttribute('y1', '9');
    line1.setAttribute('x2', '12');
    line1.setAttribute('y2', '13');
    const line2 = document.createElementNS(SVG_NS, 'line');
    line2.setAttribute('x1', '12');
    line2.setAttribute('y1', '17');
    line2.setAttribute('x2', '12.01');
    line2.setAttribute('y2', '17');
    svg.appendChild(path);
    svg.appendChild(line1);
    svg.appendChild(line2);
    return svg;
  }

  function createDangerBlockSvg() {
    const svg = createSvg(18, 18);
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '10');
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', '4.93');
    line.setAttribute('y1', '4.93');
    line.setAttribute('x2', '19.07');
    line.setAttribute('y2', '19.07');
    svg.appendChild(circle);
    svg.appendChild(line);
    return svg;
  }

  function createAlertCircleSvg() {
    const svg = createSvg(20, 20);
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '10');
    const line1 = document.createElementNS(SVG_NS, 'line');
    line1.setAttribute('x1', '12');
    line1.setAttribute('y1', '8');
    line1.setAttribute('x2', '12');
    line1.setAttribute('y2', '12');
    const line2 = document.createElementNS(SVG_NS, 'line');
    line2.setAttribute('x1', '12');
    line2.setAttribute('y1', '16');
    line2.setAttribute('x2', '12.01');
    line2.setAttribute('y2', '16');
    svg.appendChild(circle);
    svg.appendChild(line1);
    svg.appendChild(line2);
    return svg;
  }

  function createThemeIcon(theme) {
    if (theme === 'dark') {
      // Moon
      const svg = createSvg(14, 14);
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z');
      svg.appendChild(path);
      return svg;
    }
    if (theme === 'light') {
      // Sun
      const svg = createSvg(14, 14);
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', '12');
      circle.setAttribute('cy', '12');
      circle.setAttribute('r', '5');
      svg.appendChild(circle);
      const lines = [
        ['12', '1', '12', '3'],
        ['12', '21', '12', '23'],
        ['4.22', '4.22', '5.64', '5.64'],
        ['18.36', '18.36', '19.78', '19.78'],
        ['1', '12', '3', '12'],
        ['21', '12', '23', '12'],
        ['4.22', '19.78', '5.64', '18.36'],
        ['18.36', '5.64', '19.78', '4.22']
      ];
      for (const [x1, y1, x2, y2] of lines) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        svg.appendChild(line);
      }
      return svg;
    }
    // Auto / System icon (circle half filled)
    const svg = createSvg(14, 14);
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '10');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M12 2a10 10 0 0 1 0 20z');
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(circle);
    svg.appendChild(path);
    return svg;
  }

  function updateThemeButton(btn, theme) {
    while (btn.firstChild) {
      btn.removeChild(btn.firstChild);
    }
    btn.appendChild(createThemeIcon(theme));
  }

  // -------------------------------------------------------------
  // Messaging & Initialization
  // -------------------------------------------------------------

  api.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

    // Guide badge built safely
    const guideBadge = document.createElement('div');
    guideBadge.className = 'qr-snip-guide-badge';

    const badgeIcon = createQrTargetSvg(14, 14, 'currentColor');
    guideBadge.appendChild(badgeIcon);

    const badgeText1 = document.createElement('span');
    badgeText1.textContent = 'Drag a box over the QR code';
    guideBadge.appendChild(badgeText1);

    const kbd = document.createElement('kbd');
    kbd.textContent = 'Esc';
    guideBadge.appendChild(kbd);

    const badgeText2 = document.createElement('span');
    badgeText2.textContent = 'to cancel';
    guideBadge.appendChild(badgeText2);

    overlay.appendChild(guideBadge);

    // Draggable selection box with viewfinder corners built safely
    const selectionBox = document.createElement('div');
    selectionBox.className = 'qr-snip-selection-box';

    const corners = ['tl', 'tr', 'bl', 'br'];
    for (const c of corners) {
      const corner = document.createElement('div');
      corner.className = `qr-snip-corner qr-snip-corner-${c}`;
      selectionBox.appendChild(corner);
    }

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
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback below
    }
    try {
      const input = document.createElement('textarea');
      input.value = text;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      input.focus();
      input.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(input);
      return ok;
    } catch {
      return false;
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
   * Built entirely using standard DOM APIs without innerHTML.
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
    titleBox.appendChild(createQrTargetSvg(18, 18, '#38bdf8'));
    const titleText = document.createElement('span');
    titleText.textContent = 'QR Snip';
    titleBox.appendChild(titleText);

    const controls = document.createElement('div');
    controls.className = 'qr-snip-toast-controls';

    // Theme toggle button
    const themeBtn = document.createElement('button');
    themeBtn.className = 'qr-snip-icon-btn';
    themeBtn.setAttribute('title', 'Toggle Dark/Light Mode');
    updateThemeButton(themeBtn, currentTheme);
    themeBtn.onclick = () => {
      if (currentTheme === 'auto') currentTheme = 'dark';
      else if (currentTheme === 'dark') currentTheme = 'light';
      else currentTheme = 'auto';

      setStoredTheme(currentTheme);
      applyTheme(container, currentTheme);
      updateThemeButton(themeBtn, currentTheme);
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
        const dangerBanner = document.createElement('div');
        dangerBanner.className = 'qr-snip-danger-banner';

        const dangerIconSpan = document.createElement('span');
        dangerIconSpan.className = 'qr-snip-danger-icon';
        dangerIconSpan.appendChild(createDangerBlockSvg());
        dangerBanner.appendChild(dangerIconSpan);

        const dangerTextDiv = document.createElement('div');
        const strongHeading = document.createElement('strong');
        strongHeading.textContent = `Blocked Dangerous Link (${info.protocol}:)`;
        dangerTextDiv.appendChild(strongHeading);

        const descDiv = document.createElement('div');
        descDiv.style.marginTop = '3px';
        descDiv.appendChild(document.createTextNode('Links with '));
        const codeProtocol = document.createElement('code');
        codeProtocol.textContent = `${info.protocol}:`;
        descDiv.appendChild(codeProtocol);
        descDiv.appendChild(document.createTextNode(' can execute malicious scripts or load dangerous payloads and have been blocked.'));
        dangerTextDiv.appendChild(descDiv);

        dangerBanner.appendChild(dangerTextDiv);
        body.appendChild(dangerBanner);

        const fullUrlContainer = document.createElement('div');
        fullUrlContainer.style.marginTop = '10px';
        const fullUrlDiv = document.createElement('div');
        fullUrlDiv.className = 'qr-snip-url-full';
        fullUrlDiv.textContent = info.raw;
        fullUrlContainer.appendChild(fullUrlDiv);
        body.appendChild(fullUrlContainer);

        // Only allow copying text, never opening
        const copyBtn = document.createElement('button');
        copyBtn.className = 'qr-snip-btn qr-snip-btn-secondary';
        const copySpan = document.createElement('span');
        copySpan.textContent = 'Copy content';
        copyBtn.appendChild(copySpan);
        copyBtn.onclick = async () => {
          await copyText(info.raw);
          copyBtn.classList.add('qr-snip-btn-copied');
          copySpan.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.classList.remove('qr-snip-btn-copied');
            copySpan.textContent = 'Copy content';
          }, 2000);
        };
        actions.appendChild(copyBtn);

      } else if (info.isUrl) {
        // --- Case 2: URL Result (with safety warnings if detected) ---
        const domainDiv = document.createElement('div');
        domainDiv.className = 'qr-snip-url-domain';
        domainDiv.appendChild(createGlobeSvg());

        const domainStrong = document.createElement('strong');
        domainStrong.textContent = info.domain;
        domainDiv.appendChild(domainStrong);
        body.appendChild(domainDiv);

        const fullUrlDiv = document.createElement('div');
        fullUrlDiv.className = 'qr-snip-url-full';
        fullUrlDiv.setAttribute('title', info.href);
        fullUrlDiv.textContent = info.href;
        body.appendChild(fullUrlDiv);

        if (info.hasWarnings) {
          const warnBanner = document.createElement('div');
          warnBanner.className = 'qr-snip-warning-banner';

          const warnIconSpan = document.createElement('span');
          warnIconSpan.className = 'qr-snip-warning-icon';
          warnIconSpan.appendChild(createWarningTriangleSvg());
          warnBanner.appendChild(warnIconSpan);

          const warnTextDiv = document.createElement('div');
          const warnStrong = document.createElement('strong');
          warnStrong.textContent = 'Security Caution:';
          warnTextDiv.appendChild(warnStrong);

          const warnUl = document.createElement('ul');
          for (const w of info.warnings) {
            const li = document.createElement('li');
            const liStrong = document.createElement('strong');
            liStrong.textContent = `${w.title}: `;
            li.appendChild(liStrong);
            li.appendChild(document.createTextNode(w.description));
            warnUl.appendChild(li);
          }
          warnTextDiv.appendChild(warnUl);
          warnBanner.appendChild(warnTextDiv);
          body.appendChild(warnBanner);
        }

        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'qr-snip-btn qr-snip-btn-secondary';
        const copySpan = document.createElement('span');
        copySpan.textContent = 'Copy';
        copyBtn.appendChild(copySpan);
        copyBtn.onclick = async () => {
          await copyText(info.href);
          copyBtn.classList.add('qr-snip-btn-copied');
          copySpan.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.classList.remove('qr-snip-btn-copied');
            copySpan.textContent = 'Copy';
          }, 2000);
        };

        // Open link button (Never auto-opens; user must explicitly click)
        const openBtn = document.createElement('button');
        openBtn.className = info.hasWarnings
          ? 'qr-snip-btn qr-snip-btn-warning'
          : 'qr-snip-btn qr-snip-btn-primary';

        const openSpan = document.createElement('span');
        openSpan.textContent = 'Open link';
        openBtn.appendChild(openSpan);
        openBtn.appendChild(createExternalLinkSvg());

        openBtn.onclick = () => {
          try {
            const sendResult = api.runtime.sendMessage({ action: 'OPEN_URL', url: info.href });
            if (sendResult && typeof sendResult.catch === 'function') {
              sendResult.catch(() => {});
            }
          } catch (e) {
            console.error('[QR Snip] Failed to send open link message:', e);
          }
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
        const copySpan = document.createElement('span');
        copySpan.textContent = 'Copy';
        copyBtn.appendChild(copySpan);
        copyBtn.onclick = async () => {
          await copyText(result.text);
          copyBtn.classList.add('qr-snip-btn-copied');
          copySpan.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.classList.remove('qr-snip-btn-copied');
            copySpan.textContent = 'Copy';
          }, 2000);
        };
        actions.appendChild(copyBtn);
      }
    } else {
      // --- Case 4: No QR found ---
      const notFoundDiv = document.createElement('div');
      notFoundDiv.className = 'qr-snip-not-found';
      notFoundDiv.appendChild(createAlertCircleSvg());

      const messageSpan = document.createElement('span');
      messageSpan.textContent = result.message || 'No QR code found, try selecting a tighter area.';
      notFoundDiv.appendChild(messageSpan);
      body.appendChild(notFoundDiv);

      const dismissBtn = document.createElement('button');
      dismissBtn.className = 'qr-snip-btn qr-snip-btn-secondary';
      dismissBtn.textContent = 'Dismiss';
      dismissBtn.onclick = cleanUpToast;

      const retryBtn = document.createElement('button');
      retryBtn.className = 'qr-snip-btn qr-snip-btn-primary';
      const retrySpan = document.createElement('span');
      retrySpan.textContent = 'Snip Tool';
      retryBtn.appendChild(retrySpan);
      retryBtn.onclick = async () => {
        cleanUpToast();
        if (cachedScreenshotUrl) {
          initSnippingOverlay(cachedScreenshotUrl);
        } else {
          try {
            const response = await new Promise((resolve) => {
              const res = api.runtime.sendMessage({ action: 'REQUEST_RECAPTURE' }, (r) => resolve(r));
              if (res && typeof res.then === 'function') {
                res.then(resolve).catch(() => resolve(null));
              }
            });
            if (response && response.screenshotUrl) {
              cachedScreenshotUrl = response.screenshotUrl;
              initSnippingOverlay(cachedScreenshotUrl);
            }
          } catch {
            // Recapture failed
          }
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
})();
