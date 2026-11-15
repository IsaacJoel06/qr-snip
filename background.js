/**
 * QR Snip - Background Script (Manifest V3 - Cross-Browser)
 * Compatible with Chrome, Edge, and Firefox (128+).
 * Handles tab capture, context menus, script injection, restricted page notifications,
 * and user-initiated link opening with protocol verification.
 */

// Cross-browser WebExtension API shim
const api = globalThis.browser ?? globalThis.chrome;

const CONTEXT_MENU_ID = 'scan-qr-image';

/**
 * Robust cross-browser tab screenshot capture.
 * Works seamlessly whether the underlying browser uses Promises or callbacks.
 * @param {number|null} [windowId]
 * @returns {Promise<string>}
 */
function captureTab(windowId) {
  return new Promise((resolve, reject) => {
    try {
      const targetWin = typeof windowId === 'number' ? windowId : null;
      const res = api.tabs.captureVisibleTab(targetWin, { format: 'png' }, (dataUrl) => {
        if (api.runtime.lastError) {
          reject(new Error(api.runtime.lastError.message));
        } else {
          resolve(dataUrl);
        }
      });
      // If browser API returned a Promise (e.g. Firefox browser.tabs.*)
      if (res && typeof res.then === 'function') {
        res.then(resolve).catch(reject);
      }
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Setup context menu on extension installation / startup.
 * Handles both Promise-based and callback-based removeAll.
 */
function setupContextMenu() {
  const onRemoved = () => {
    api.contextMenus.create(
      {
        id: CONTEXT_MENU_ID,
        title: 'Scan QR in this image',
        contexts: ['image']
      },
      () => {
        // Suppress benign runtime.lastError if menu item was already created
        if (api.runtime.lastError) {
          // ignore duplicate id
        }
      }
    );
  };

  try {
    const res = api.contextMenus.removeAll(onRemoved);
    if (res && typeof res.then === 'function') {
      res.then(onRemoved).catch(onRemoved);
    }
  } catch {
    onRemoved();
  }
}

api.runtime.onInstalled.addListener(setupContextMenu);

/**
 * Checks whether the given tab URL is an internal or restricted browser page.
 * Extensions cannot execute scripts or capture content on these pages.
 * Covers Chrome, Edge, and Firefox restricted schemes and domains.
 * @param {string} [url]
 * @returns {boolean}
 */
function isRestrictedPage(url) {
  if (!url) return true;
  const lower = url.toLowerCase();
  return (
    lower.startsWith('chrome://') ||
    lower.startsWith('chrome-extension://') ||
    lower.startsWith('edge://') ||
    lower.startsWith('about:') ||
    lower.startsWith('moz-extension://') ||
    lower.startsWith('view-source:') ||
    lower.startsWith('data:') ||
    lower.startsWith('javascript:') ||
    lower.includes('chrome.google.com/webstore') ||
    lower.includes('chromewebstore.google.com') ||
    lower.includes('addons.mozilla.org')
  );
}

/**
 * Notifies the user with a friendly native notification and action badge
 * when QR Snip is triggered on a restricted page.
 * @param {object} tab
 */
function notifyRestrictedPage(tab) {
  try {
    api.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'QR Snip: Cannot run on this page',
      message: 'Browser security restricts extensions from running on internal pages (like chrome:// or about:) and extension stores. Please open a regular webpage to scan QR codes.'
    });
  } catch (err) {
    console.warn('[QR Snip] Notification error:', err);
  }

  if (tab && tab.id) {
    try {
      api.action.setBadgeText({ tabId: tab.id, text: '!' });
      api.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#f59e0b' });
      api.action.setTitle({
        tabId: tab.id,
        title: 'QR Snip cannot run on internal browser pages or extension stores.'
      });

      setTimeout(() => {
        try {
          api.action.setBadgeText({ tabId: tab.id, text: '' });
          api.action.setTitle({ tabId: tab.id, title: 'QR Snip (Alt+Shift+Q)' });
        } catch {
          // Tab may have closed
        }
      }, 4500);
    } catch (err) {
      console.warn('[QR Snip] Badge update error:', err);
    }
  }
}

/**
 * Ensures content script and styles are active in the target tab.
 * @param {number} tabId
 */
async function ensureContentScriptInjected(tabId) {
  try {
    const ping = await api.tabs.sendMessage(tabId, { action: 'PING' });
    if (ping && ping.status === 'PONG') {
      return; // Already responsive
    }
  } catch {
    // Not yet injected
  }

  await api.scripting.insertCSS({
    target: { tabId },
    files: ['content.css']
  });

  await api.scripting.executeScript({
    target: { tabId },
    files: ['jsQR.min.js', 'content.js']
  });
}

// -------------------------------------------------------------
// 1. Toolbar Action & Shortcut (Alt+Shift+Q) Handler
// -------------------------------------------------------------
api.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;

  if (isRestrictedPage(tab.url)) {
    notifyRestrictedPage(tab);
    return;
  }

  try {
    // Capture visible tab screenshot
    const screenshotUrl = await captureTab(tab.windowId);

    // Ensure content script is ready
    await ensureContentScriptInjected(tab.id);

    // Initialize snipping overlay
    await api.tabs.sendMessage(tab.id, {
      action: 'START_SNIP',
      screenshotUrl
    });
  } catch (error) {
    console.error('[QR Snip] Failed to start snipping:', error);
  }
});

// -------------------------------------------------------------
// 2. Right-Click Context Menu: "Scan QR in this image"
// -------------------------------------------------------------
api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab || !tab.id) return;

  if (isRestrictedPage(tab.url)) {
    notifyRestrictedPage(tab);
    return;
  }

  try {
    // Capture tab in case we need a fallback for CORS-tainted images
    const screenshotUrl = await captureTab(tab.windowId);

    await ensureContentScriptInjected(tab.id);

    // Send direct image scan request
    await api.tabs.sendMessage(tab.id, {
      action: 'SCAN_IMAGE_DIRECT',
      srcUrl: info.srcUrl,
      screenshotUrl
    });
  } catch (error) {
    console.error('[QR Snip] Failed to scan image from context menu:', error);
  }
});

// -------------------------------------------------------------
// 3. Message Listener (Safe Link Opening & Recapture)
// -------------------------------------------------------------
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Safe link opener: strictly enforces http and https only
  // Never auto-opens; triggered only by user clicking "Open link"
  if (message.action === 'OPEN_URL' && message.url) {
    try {
      const parsedUrl = new URL(message.url);

      // Block javascript:, data:, vbscript:, and file: protocols completely
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        const createResult = api.tabs.create({ url: parsedUrl.href, active: true });
        if (createResult && typeof createResult.then === 'function') {
          createResult
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
          return true;
        }
        sendResponse({ success: true });
      } else {
        console.warn('[QR Snip] Blocked non-http(s) protocol:', parsedUrl.protocol);
        sendResponse({ success: false, error: 'Protocol blocked for security' });
      }
    } catch (err) {
      console.error('[QR Snip] Malformed URL rejected:', message.url, err);
      sendResponse({ success: false, error: 'Malformed URL' });
    }
    return true;
  }

  // Provide fresh capture if content script requests recapture
  if (message.action === 'REQUEST_RECAPTURE' && sender.tab) {
    captureTab(sender.tab.windowId)
      .then((screenshotUrl) => sendResponse({ success: true, screenshotUrl }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }
});
