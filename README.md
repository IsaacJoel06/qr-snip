# QR Snip

A fast, lightweight, privacy-focused Chrome Extension (Manifest V3) that scans any QR code visible on your screen or inside images, with built-in security screening and zero external network calls.

---

## Key Features

- **Viewport Snipping:** Capture and scan any QR code on screen using the toolbar icon or shortcut <kbd>Alt+Shift+Q</kbd>.
- **Right-Click Image Scan:** Right-click any image on the web and select **"Scan QR in this image"** for instant decoding without dragging.
- **High-DPI & Zoom Resilient:** Automatically scales pixel coordinates to match `devicePixelRatio` and browser zoom settings.
- **100% Offline & Private:** Uses bundled `jsQR.min.js`. Never contacts remote servers, tracks analytics, or makes network requests.
- **Security Warning Banner:** Flags URLs using unencrypted `http://`, internationalized/punycode lookalike domains, or URL shorteners (`bit.ly`, `tinyurl.com`, `t.co`, etc.) with a clear caution notice before opening.
- **Dangerous Scheme Blocking:** Completely blocks `javascript:` and `data:` URLs from opening.
- **Dark & Light Mode:** Seamlessly matches your operating system theme, with an interactive toggle switch (🌓 / 🌙 / ☀️).
- **Restricted Page Warnings:** Notifies you with friendly native alerts when triggered on restricted pages like `chrome://` or the Web Store.
- **Safe Link Handling:** Links are never opened automatically. Opening is strictly user-triggered.

---

## Screenshots

<!-- Add your screenshots here after capturing -->
<div align="center">
  <img src="https://via.placeholder.com/800x450/0f172a/38bdf8?text=QR+Snip+Overlay+%26+Toast+Preview" alt="QR Snip Preview" width="700" />
</div>

---

## Installation

1. Clone or download this repository:
   ```bash
   git clone https://github.com/IsaacJoelMithran/qr-snip.git
   ```
2. Open Google Chrome and enter `chrome://extensions/` in the URL bar.
3. Toggle on **Developer mode** in the top-right corner.
4. Click the **Load unpacked** button in the top-left.
5. Select the project directory (`qr-snip`).
6. Pin **QR Snip** to your browser toolbar for quick access.

---

## Usage

| Action | Shortcut / Trigger | Description |
| :--- | :--- | :--- |
| **Start Snip** | <kbd>Alt+Shift+Q</kbd> or click extension icon | Dims the page; drag a rectangle over any QR code. |
| **Scan Image** | Right-click image &rarr; **Scan QR in this image** | Scans an image element directly without selecting an area. |
| **Cancel / Close** | <kbd>Esc</kbd> or click ✕ | Cancels current selection or dismisses the popup toast. |
| **Toggle Theme** | Click theme button in toast header | Switches between System Auto, Dark, and Light themes. |

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
2. Make your changes and test locally using `test.html`.
3. Commit your changes and open a Pull Request.

---

## License

Distributed under the [MIT License](LICENSE). Copyright &copy; 2026 Isaac Joel Mithran.
