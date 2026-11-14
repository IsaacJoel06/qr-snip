# Privacy Policy for QR Snip

**Effective Date:** November 2026

QR Snip is engineered with privacy as a foundational principle. The extension operates completely client-side in your browser.

## 1. No Data Collection or Transmission
- **Zero Telemetry:** QR Snip does not collect, record, track, or analyze any user activity or browsing habits.
- **Zero Remote Calls:** No analytics, trackers, external scripts, or remote APIs are embedded or contacted.
- **100% Offline Processing:** All QR code scanning and image cropping occur entirely in memory within your local browser session using the bundled `jsQR` library.

## 2. Permissions Explained
QR Snip requests the minimum permissions required to perform its functions:

- `activeTab`: Allows taking a temporary screenshot of the active visible tab strictly when you click the extension icon or press the shortcut (`Alt+Shift+Q`). No access to your browser history or other tabs.
- `scripting`: Dynamically loads the selection overlay and local decoding script into the active tab when requested.
- `contextMenus`: Adds the "Scan QR in this image" option to your right-click menu when clicking on web images.
- `notifications`: Alerts you if you attempt to use the tool on restricted browser pages (such as `chrome://` settings or the Chrome Web Store) where extensions cannot run.

## 3. Link Handling & Safety
- Decoded URLs are never automatically opened or prefetched in the background.
- Links only open when you explicitly click the "Open link" button.
- Dangerous schemes (`javascript:`, `data:`) are permanently blocked from opening to protect your device.

## 4. Updates & Inquiries
For questions or source code verification, visit the project repository on GitHub:
https://github.com/IsaacJoelMithran/qr-snip
