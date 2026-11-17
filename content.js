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
   * Supports mouse, touch, and pen interactions with pointer events and pointer capture.
   * @param {string} screenshotUrl - Base64 PNG data URL of the visible tab
   */
  function initSnippingOverlay(screenshotUrl) {
    const overlay = document.createElement('div');
    overlay.className = 'qr-snip-overlay';

    // Guide badge built safely with Cancel button for touch users
    const guideBadge = document.createElement('div');
    guideBadge.className = 'qr-snip-guide-badge';

    const badgeIcon = createQrTargetSvg(14, 14, 'currentColor');
    guideBadge.appendChild(badgeIcon);

    const badgeText = document.createElement('span');
    badgeText.textContent = 'Drag over the QR code';
    guideBadge.appendChild(badgeText);

    const kbd = document.createElement('kbd');
    kbd.className = 'qr-snip-guide-kbd';
    kbd.textContent = 'Esc';
    guideBadge.appendChild(kbd);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'qr-snip-guide-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.setAttribute('type', 'button');
    cancelBtn.setAttribute('aria-label', 'Cancel QR Snip');

    // Prevent pointerdown on badge / cancel button from initiating drag
    guideBadge.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    }, { capture: true });

    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cleanUpOverlay();
    });

    guideBadge.appendChild(cancelBtn);
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
    let activePointerId = null;
    let startX = 0;
    let startY = 0;
    let currentRect = { left: 0, top: 0, width: 0, height: 0 };

    function onPointerDown(e) {
      // For mouse, only primary left click (button === 0). For touch/pen, button is 0 or -1.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (activePointerId !== null) return; // Ignore multi-touch secondary fingers

      e.preventDefault();
      e.stopPropagation();

      activePointerId = e.pointerId;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      currentRect = { left: startX, top: startY, width: 0, height: 0 };

      try {
        overlay.setPointerCapture(e.pointerId);
      } catch {
        // Fallback if pointer capture is unsupported
      }

      overlay.classList.add('qr-snip-dragging');
      selectionBox.style.display = 'block';
      updateSelectionStyle(selectionBox, currentRect);
    }

    function onPointerMove(e) {
      if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
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

    function onPointerUp(e) {
      if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
      e.preventDefault();
      e.stopPropagation();

      try {
        if (overlay.hasPointerCapture && overlay.hasPointerCapture(e.pointerId)) {
          overlay.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Fallback
      }

      isDragging = false;
      activePointerId = null;
      cleanUpOverlay();

      // Ignore selections smaller than about 20x20 px so an accidental tap doesn't trigger a scan.
      // Treat a single tap as cancel.
      if (currentRect.width < 20 || currentRect.height < 20) {
        return;
      }

      processSelection(screenshotUrl, currentRect);
    }

    function onPointerCancel(e) {
      if (activePointerId !== null && e.pointerId === activePointerId) {
        try {
          if (overlay.hasPointerCapture && overlay.hasPointerCapture(e.pointerId)) {
            overlay.releasePointerCapture(e.pointerId);
          }
        } catch {
          // Fallback
        }
        isDragging = false;
        activePointerId = null;
        cleanUpOverlay();
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cleanUpOverlay();
      }
    }

    overlay.addEventListener('pointerdown', onPointerDown, { capture: true, passive: false });
    window.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
    window.addEventListener('pointerup', onPointerUp, { capture: true, passive: false });
    window.addEventListener('pointercancel', onPointerCancel, { capture: true, passive: false });
    window.addEventListener('keydown', onKeyDown, { capture: true });

    overlay.__teardown = () => {
      overlay.removeEventListener('pointerdown', onPointerDown, { capture: true, passive: false });
      window.removeEventListener('pointermove', onPointerMove, { capture: true, passive: false });
      window.removeEventListener('pointerup', onPointerUp, { capture: true, passive: false });
      window.removeEventListener('pointercancel', onPointerCancel, { capture: true, passive: false });
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
  // Cropping & Multi-Pass Decoding
  // -------------------------------------------------------------

  // Set to true to log multi-pass decoding diagnostics to the browser console
  const DEBUG = false;

  function logDebug(message) {
    if (DEBUG) {
      console.log(`[QR Snip] ${message}`);
    }
  }

  /**
   * Pads an RGBA image buffer with a solid white quiet zone (~10% on each side)
   * entirely in typed array memory, avoiding any secondary canvas creation or redrawing.
   * @param {Uint8ClampedArray} srcData
   * @param {number} srcW
   * @param {number} srcH
   * @param {number} padRatio
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
   */
  function padImageData(srcData, srcW, srcH, padRatio = 0.10) {
    const padX = Math.max(4, Math.round(srcW * padRatio));
    const padY = Math.max(4, Math.round(srcH * padRatio));
    const paddedW = srcW + padX * 2;
    const paddedH = srcH + padY * 2;
    const paddedData = new Uint8ClampedArray(paddedW * paddedH * 4);

    // Initialize with opaque white (255, 255, 255, 255)
    paddedData.fill(255);

    const rowByteLength = srcW * 4;
    for (let y = 0; y < srcH; y++) {
      const srcOffset = y * rowByteLength;
      const dstOffset = ((padY + y) * paddedW + padX) * 4;
      paddedData.set(srcData.subarray(srcOffset, srcOffset + rowByteLength), dstOffset);
    }

    return { data: paddedData, width: paddedW, height: paddedH };
  }

  /**
   * Performs an integer nearest-neighbor upscale directly on an RGBA pixel buffer
   * without creating or drawing to an intermediary canvas.
   * @param {Uint8ClampedArray} srcData
   * @param {number} srcW
   * @param {number} srcH
   * @param {number} scale
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
   */
  function upscaleNearestNeighbor(srcData, srcW, srcH, scale) {
    const s = Math.max(1, Math.round(scale));
    if (s === 1) {
      return { data: srcData, width: srcW, height: srcH };
    }

    const dstW = srcW * s;
    const dstH = srcH * s;
    const dstData = new Uint8ClampedArray(dstW * dstH * 4);

    if (srcData.byteOffset % 4 === 0) {
      const src32 = new Uint32Array(srcData.buffer, srcData.byteOffset, srcW * srcH);
      const dst32 = new Uint32Array(dstData.buffer, dstData.byteOffset, dstW * dstH);

      for (let y = 0; y < srcH; y++) {
        const srcRowStart = y * srcW;
        const dstRowStart = (y * s) * dstW;

        for (let x = 0; x < srcW; x++) {
          const pixel = src32[srcRowStart + x];
          const outBase = dstRowStart + x * s;
          for (let sx = 0; sx < s; sx++) {
            dst32[outBase + sx] = pixel;
          }
        }

        const firstRow = dst32.subarray(dstRowStart, dstRowStart + dstW);
        for (let sy = 1; sy < s; sy++) {
          dst32.set(firstRow, dstRowStart + sy * dstW);
        }
      }
    } else {
      const rowByteLen = dstW * 4;
      for (let y = 0; y < srcH; y++) {
        const dstRowBase = (y * s) * rowByteLen;

        for (let x = 0; x < srcW; x++) {
          const srcIdx = (y * srcW + x) * 4;
          const r = srcData[srcIdx];
          const g = srcData[srcIdx + 1];
          const b = srcData[srcIdx + 2];
          const a = srcData[srcIdx + 3];

          for (let sx = 0; sx < s; sx++) {
            const dstIdx = dstRowBase + (x * s + sx) * 4;
            dstData[dstIdx] = r;
            dstData[dstIdx + 1] = g;
            dstData[dstIdx + 2] = b;
            dstData[dstIdx + 3] = a;
          }
        }

        const firstRow = dstData.subarray(dstRowBase, dstRowBase + rowByteLen);
        for (let sy = 1; sy < s; sy++) {
          dstData.set(firstRow, dstRowBase + sy * rowByteLen);
        }
      }
    }

    return { data: dstData, width: dstW, height: dstH };
  }

  /**
   * Downscales an RGBA pixel buffer to a maximum dimension using bilinear interpolation
   * directly in memory, without creating or redrawing canvases.
   * @param {Uint8ClampedArray} srcData
   * @param {number} srcW
   * @param {number} srcH
   * @param {number} maxSide
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
   */
  function downscaleImageData(srcData, srcW, srcH, maxSide = 800) {
    const currentMax = Math.max(srcW, srcH);
    if (currentMax <= maxSide) {
      return { data: srcData, width: srcW, height: srcH };
    }

    const scale = maxSide / currentMax;
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));
    const dstData = new Uint8ClampedArray(dstW * dstH * 4);

    const xRatio = srcW / dstW;
    const yRatio = srcH / dstH;

    for (let dy = 0; dy < dstH; dy++) {
      const srcY = dy * yRatio;
      const y0 = Math.floor(srcY);
      const y1 = Math.min(y0 + 1, srcH - 1);
      const yLerp = srcY - y0;
      const dstRowOffset = dy * dstW * 4;

      for (let dx = 0; dx < dstW; dx++) {
        const srcX = dx * xRatio;
        const x0 = Math.floor(srcX);
        const x1 = Math.min(x0 + 1, srcW - 1);
        const xLerp = srcX - x0;

        const idx00 = (y0 * srcW + x0) * 4;
        const idx10 = (y0 * srcW + x1) * 4;
        const idx01 = (y1 * srcW + x0) * 4;
        const idx11 = (y1 * srcW + x1) * 4;

        const dstIdx = dstRowOffset + dx * 4;

        for (let c = 0; c < 4; c++) {
          const top = srcData[idx00 + c] * (1 - xLerp) + srcData[idx10 + c] * xLerp;
          const bot = srcData[idx01 + c] * (1 - xLerp) + srcData[idx11 + c] * xLerp;
          dstData[dstIdx + c] = Math.round(top * (1 - yLerp) + bot * yLerp);
        }
      }
    }

    return { data: dstData, width: dstW, height: dstH };
  }

  /**
   * Applies grayscale conversion, contrast stretching, and Otsu's optimal thresholding
   * to produce a high-contrast binarized RGBA buffer for jsQR.
   * @param {ImageData|Uint8ClampedArray} imageData
   * @param {number} width
   * @param {number} height
   * @returns {Uint8ClampedArray}
   */
  function applyContrastStretchAndOtsu(imageData, width, height) {
    const data = imageData.data || imageData;
    const numPixels = width * height;
    const grays = new Uint8Array(numPixels);

    let min = 255;
    let max = 0;

    // 1. Grayscale conversion (standard luminance formula) and find min/max
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      grays[p] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }

    // 2. Contrast stretching and histogram calculation
    const histogram = new Uint32Array(256);
    const range = max - min;

    if (range > 0) {
      for (let p = 0; p < numPixels; p++) {
        const stretched = Math.round(((grays[p] - min) / range) * 255);
        grays[p] = stretched;
        histogram[stretched]++;
      }
    } else {
      for (let p = 0; p < numPixels; p++) {
        histogram[grays[p]]++;
      }
    }

    // 3. Simple Otsu's threshold calculation
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      sum += i * histogram[i];
    }

    let sumB = 0;
    let wB = 0;
    let varMax = 0;
    let threshold = 128;

    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;
      const wF = numPixels - wB;
      if (wF === 0) break;

      sumB += t * histogram[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;

      const varBetween = wB * wF * (mB - mF) * (mB - mF);
      if (varBetween > varMax) {
        varMax = varBetween;
        threshold = t;
      }
    }

    // 4. Binarize to black (0) and white (255) with full opacity (255)
    const binarized = new Uint8ClampedArray(data.length);
    for (let p = 0, i = 0; p < numPixels; p++, i += 4) {
      const val = grays[p] < threshold ? 0 : 255;
      binarized[i] = val;
      binarized[i + 1] = val;
      binarized[i + 2] = val;
      binarized[i + 3] = 255;
    }

    return binarized;
  }

  /**
   * Multi-pass decoding pipeline for stylized, tight-cropped, or low-quality QR codes.
   * Operates purely on pixel buffers / ImageData to prevent origin tainting in Firefox:
   * (1) Original crop with a white quiet-zone border (~10% on each side)
   * (2) 2x and 3x upscale with nearest-neighbor resampling
   * (3) Grayscale with contrast stretch and a simple Otsu threshold
   * (4) Downscale to 800px max side if the crop is large
   * Keeps inversionAttempts: 'attemptBoth'.
   * @param {ImageData|HTMLCanvasElement|{data: Uint8ClampedArray, width: number, height: number}} source
   * @returns {object|null}
   */
  function decodeQrWithMultiPass(source) {
    if (typeof jsQR !== 'function' || !source) {
      return null;
    }

    let rawData = null;
    let width = 0;
    let height = 0;

    if (source instanceof ImageData || (source.data && source.width && source.height)) {
      rawData = source.data;
      width = source.width;
      height = source.height;
    } else if (typeof source.getContext === 'function' || source instanceof HTMLCanvasElement) {
      try {
        width = source.width;
        height = source.height;
        if (width <= 0 || height <= 0) return null;
        const ctx = source.getContext('2d', { willReadFrequently: true });
        const imgData = ctx.getImageData(0, 0, width, height);
        rawData = imgData.data;
      } catch (err) {
        logDebug(`Failed to extract ImageData from canvas: ${err}`);
        return null;
      }
    }

    if (!rawData || width <= 0 || height <= 0) {
      return null;
    }

    // -------------------------------------------------------------
    // Pass 1: Original crop with ~10% white quiet-zone border
    // -------------------------------------------------------------
    let padded = null;
    try {
      padded = padImageData(rawData, width, height, 0.10);
      const decoded = jsQR(padded.data, padded.width, padded.height, { inversionAttempts: 'attemptBoth' });
      if (decoded && decoded.data && decoded.data.trim()) {
        logDebug('Pass 1 (original crop with white quiet-zone border) succeeded');
        return decoded;
      }
    } catch (err) {
      logDebug(`Pass 1 failed: ${err}`);
    }

    const baseData = padded ? padded.data : rawData;
    const baseW = padded ? padded.width : width;
    const baseH = padded ? padded.height : height;

    // -------------------------------------------------------------
    // Pass 2: 2x and 3x upscale with nearest-neighbor resampling
    // -------------------------------------------------------------
    let up2x = null;
    try {
      up2x = upscaleNearestNeighbor(baseData, baseW, baseH, 2);
      const decoded = jsQR(up2x.data, up2x.width, up2x.height, { inversionAttempts: 'attemptBoth' });
      if (decoded && decoded.data && decoded.data.trim()) {
        logDebug('Pass 2a (2x upscale nearest-neighbor) succeeded');
        return decoded;
      }
    } catch (err) {
      logDebug(`Pass 2a failed: ${err}`);
    }

    try {
      const up3x = upscaleNearestNeighbor(baseData, baseW, baseH, 3);
      const decoded = jsQR(up3x.data, up3x.width, up3x.height, { inversionAttempts: 'attemptBoth' });
      if (decoded && decoded.data && decoded.data.trim()) {
        logDebug('Pass 2b (3x upscale nearest-neighbor) succeeded');
        return decoded;
      }
    } catch (err) {
      logDebug(`Pass 2b failed: ${err}`);
    }

    // -------------------------------------------------------------
    // Pass 3: Grayscale with contrast stretch and Otsu threshold
    // -------------------------------------------------------------
    try {
      const otsuData = applyContrastStretchAndOtsu(baseData, baseW, baseH);
      let decoded = jsQR(otsuData, baseW, baseH, { inversionAttempts: 'attemptBoth' });
      if (decoded && decoded.data && decoded.data.trim()) {
        logDebug('Pass 3 (grayscale with contrast stretch and Otsu threshold) succeeded');
        return decoded;
      }

      // Also attempt Otsu threshold on the 2x upscaled image for low-contrast small codes
      if (up2x && up2x.width <= 1200) {
        const otsuData2x = applyContrastStretchAndOtsu(up2x.data, up2x.width, up2x.height);
        decoded = jsQR(otsuData2x, up2x.width, up2x.height, { inversionAttempts: 'attemptBoth' });
        if (decoded && decoded.data && decoded.data.trim()) {
          logDebug('Pass 3b (upscaled Otsu threshold) succeeded');
          return decoded;
        }
      }
    } catch (err) {
      logDebug(`Pass 3 failed: ${err}`);
    }

    // -------------------------------------------------------------
    // Pass 4: Downscale to 800px max side if the crop is large
    // -------------------------------------------------------------
    try {
      const maxSide = Math.max(baseW, baseH);
      if (maxSide > 800) {
        const down = downscaleImageData(baseData, baseW, baseH, 800);
        const decoded = jsQR(down.data, down.width, down.height, { inversionAttempts: 'attemptBoth' });
        if (decoded && decoded.data && decoded.data.trim()) {
          logDebug('Pass 4 (downscale to 800px max side) succeeded');
          return decoded;
        }
      }
    } catch (err) {
      logDebug(`Pass 4 failed: ${err}`);
    }

    logDebug('All decoding passes exhausted without match');
    return null;
  }

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

      let rawImageData = null;
      try {
        rawImageData = ctx.getImageData(0, 0, cropW, cropH);
      } catch (secErr) {
        logDebug(`SecurityError reading canvas imageData: ${secErr}`);
        showResultToast({ success: false });
        return;
      }

      const decoded = decodeQrWithMultiPass(rawImageData);

      if (decoded && decoded.data && decoded.data.trim().length > 0) {
        showResultToast({ success: true, text: decoded.data.trim() });
      } else {
        showResultToast({ success: false });
      }
    } catch (err) {
      logDebug(`Error processing selection: ${err}`);
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

        try {
          const imgData = ctx.getImageData(0, 0, width, height);
          decoded = decodeQrWithMultiPass(imgData);
        } catch (corsErr) {
          logDebug(`Method 1 direct canvas getImageData blocked (CORS): ${corsErr}`);
          decoded = null;
        }
      }
    } catch (directErr) {
      logDebug(`Method 1 direct image decode failed: ${directErr}`);
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

            try {
              const tabData = ctx.getImageData(0, 0, cropW, cropH);
              decoded = decodeQrWithMultiPass(tabData);
            } catch (tabCropErr) {
              logDebug(`Method 2 tab screenshot crop getImageData error: ${tabCropErr}`);
              decoded = null;
            }
          }
        }
      } catch (fallbackErr) {
        logDebug(`Fallback direct image crop failed: ${fallbackErr}`);
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
