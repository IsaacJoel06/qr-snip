# QR Snip

A fast, lightweight, privacy-focused WebExtension (Manifest V3) that scans any QR code visible on your screen or inside images, with built-in security screening and zero external network calls.

**Supported Browsers:** Google Chrome, Microsoft Edge, and Mozilla Firefox 140+.

---

## Key Features

- **Viewport Snipping:** Capture and scan any QR code on screen using the toolbar icon or shortcut <kbd>Alt+Shift+Q</kbd>.
- **Right-Click Image Scan:** Right-click any image on the web and select **"Scan QR in this image"** for instant decoding without dragging.
- **Cross-Browser Engine:** Native WebExtension compatibility across Chromium (Chrome, Edge, Brave) and Firefox.
- **High-DPI & Zoom Resilient:** Automatically scales pixel coordinates to match `devicePixelRatio` and browser zoom settings.
- **100% Offline & Private:** Uses bundled `jsQR.min.js`. Never contacts remote servers, tracks analytics, or makes network requests.
- **Security Warning Banner:** Flags URLs using unencrypted `http://`, internationalized/punycode lookalike domains, or URL shorteners (`bit.ly`, `tinyurl.com`, `t.co`, etc.) with a clear caution notice before opening.
- **Dangerous Scheme Blocking:** Completely blocks `javascript:` and `data:` URLs from opening.
- **Dark & Light Mode:** Seamlessly matches your operating system theme, with an interactive toggle switch, safely persisted in storage.
- **Restricted Page Warnings:** Notifies you with friendly native alerts when triggered on restricted pages (e.g., `chrome://`, `about:`, Chrome Web Store, or Firefox Add-ons).
- **Safe Link Handling:** Links are never opened automatically. Opening is strictly user-triggered.

---

## Screenshots

<!-- Add your screenshots here after capturing -->
<div align="center">
  <img width="1907" height="1382" alt="image" src="https://github.com/user-attachments/assets/241b7450-ccb2-4e38-a2db-ed5fd9c50bca" />
  <img width="1865" height="1384" alt="image" src="https://github.com/user-attachments/assets/c2827034-fb91-40c0-ba80-a84148e6a049" />
  <img width="1900" height="1377" alt="image" src="https://github.com/user-attachments/assets/8c62ace0-953f-459c-b72d-aa367ad5d1e0" />



</div>

---

## Installation

### Google Chrome / Microsoft Edge
1. Clone or download this repository:
   ```bash
   git clone https://github.com/IsaacJoelMithran/qr-snip.git
   ```
2. Navigate to `chrome://extensions/` (or `edge://extensions/`).
3. Toggle on **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the `qr-snip` project folder.
5. Pin **QR Snip** to your browser toolbar.

> *Note for Chrome users:* Chrome may display a minor developer warning: `"Unrecognized manifest key 'scripts'"`. This is completely safe and occurs because the manifest simultaneously provides a `scripts` fallback for Firefox MV3. Chrome uses `service_worker` and runs normally.

---

### Mozilla Firefox (140+)
1. Open Firefox and go to:
   ```text
   about:debugging#/runtime/this-firefox
   ```
2. Click **Load Temporary Add-on...**
3. Select [manifest.json](manifest.json) inside the `qr-snip` folder.
4. Pin **QR Snip** to your Firefox toolbar.

> *Note for Firefox users:* Temporary add-ons in Firefox remain loaded for your active browser session and are automatically unloaded when Firefox is fully closed or restarted. To keep it permanently installed, the add-on can be self-signed via [AMO](https://addons.mozilla.org/).

---

## Usage

| Action | Shortcut / Trigger | Description |
| :--- | :--- | :--- |
| **Start Snip** | <kbd>Alt+Shift+Q</kbd> or click extension icon | Dims the page; drag a rectangle over any QR code. |
| **Scan Image** | Right-click image &rarr; **Scan QR in this image** | Scans an image element directly without selecting an area. |
| **Cancel / Close** | <kbd>Esc</kbd> or click ✕ | Cancels current selection or dismisses the popup toast. |
| **Toggle Theme** | Click theme button in toast header | Switches between System Auto, Dark, and Light themes. |

---

## Testing

A complete testing guide with an interactive checklist is available in [TESTING.md](TESTING.md). Open [test.html](test.html) directly in any browser to verify all features.

---

## Privacy & Security

- **Zero Data Collection:** QR Snip does not track, collect, or transmit any user information.
- **No Remote Dependencies:** All scanning occurs strictly within your browser's memory using bundled local scripts.
- **Minimal Permissions:** Uses only `activeTab`, `scripting`, `contextMenus`, and `notifications`. No host permissions (`<all_urls>`) requested.
- Read our full [PRIVACY.md](PRIVACY.md) for details.

---

## Development & Contribution

1. Fork the repository and create your feature branch:
   ```bash
   git checkout -b feature/my-enhancement
   ```
2. Make your changes and test across both Chrome and Firefox using `test.html` and `TESTING.md`.
3. Commit your changes and open a Pull Request.

---

## License

Distributed under the [MIT License](LICENSE). Copyright &copy; 2026 Isaac Joel Mithran.
