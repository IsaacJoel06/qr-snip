/**
 * QR Snip - Background Service Worker (Manifest V3)
 * Handles tab capture, context menus, script injection, restricted page notifications,
 * and user-initiated link opening with protocol verification.
 */

const CONTEXT_MENU_ID = 'scan-qr-image';

// Setup context menu on extension installation / startup
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Scan QR in this image',
      contexts: ['image']
    });
  });
});

/**
 * Checks whether the given tab URL is an internal or restricted browser page.
 * Extensions cannot execute scripts or capture content on these pages.
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
    lower.startsWith('view-source:') ||
    lower.includes('chrome.google.com/webstore') ||
    lower.includes('chromewebstore.google.com')
  );
}

/**
 * Notifies the user with a friendly native notification and action badge
 * when QR Snip is triggered on a restricted page.
 * @param {chrome.tabs.Tab} tab
 */
function notifyRestrictedPage(tab) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'QR Snip: Cannot run on this page',
    message: 'Chrome security restricts extensions from running on internal pages (such as chrome://) and the Chrome Web Store. Please open a regular webpage to scan QR codes.'
  });

  if (tab && tab.id) {
    chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#f59e0b' });
    chrome.action.setTitle({
      tabId: tab.id,
      title: 'QR Snip cannot run on internal browser pages or the Chrome Web Store.'
    });

    setTimeout(() => {
      chrome.action.setBadgeText({ tabId: tab.id, text: '' });
      chrome.action.setTitle({ tabId: tab.id, title: 'QR Snip (Alt+Shift+Q)' });
    }, 4500);
  }
}

/**
 * Ensures content script and styles are active in the target tab.
 * @param {number} tabId
 */
async function ensureContentScriptInjected(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
    if (ping && ping.status === 'PONG') {
      return; // Already responsive
    }
  } catch {
    // Not yet injected
  }

  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ['content.css']
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['jsQR.min.js', 'content.js']
  });
}

// -------------------------------------------------------------
// 1. Toolbar Action & Shortcut (Alt+Shift+Q) Handler
// -------------------------------------------------------------
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;

  if (isRestrictedPage(tab.url)) {
    notifyRestrictedPage(tab);
    return;
  }

  try {
    // Capture visible tab
    const screenshotUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

    // Ensure content script is ready
    await ensureContentScriptInjected(tab.id);

    // Initialize snipping overlay
    await chrome.tabs.sendMessage(tab.id, {
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
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab || !tab.id) return;

  if (isRestrictedPage(tab.url)) {
    notifyRestrictedPage(tab);
    return;
  }

  try {
    // Capture tab in case we need a fallback for CORS-tainted images
    const screenshotUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

    await ensureContentScriptInjected(tab.id);

    // Send direct image scan request
    await chrome.tabs.sendMessage(tab.id, {
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
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Safe link opener: strictly enforces http and https only
  // Never auto-opens; triggered only by user clicking "Open link"
  if (message.action === 'OPEN_URL' && message.url) {
    try {
      const parsedUrl = new URL(message.url);

      // Block javascript:, data:, vbscript:, and file: protocols completely
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        chrome.tabs.create({ url: parsedUrl.href, active: true });
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
  if (message.action === 'REQUEST_RECAPTURE' && sender.tab && sender.tab.windowId) {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' })
      .then((screenshotUrl) => sendResponse({ success: true, screenshotUrl }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
