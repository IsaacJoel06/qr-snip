# QR Snip - Cross-Browser Testing Guide

This guide provides step-by-step instructions to verify that QR Snip operates properly in **Google Chrome / Microsoft Edge** and **Mozilla Firefox (140+)**.

---

## 1. Browser Installation Steps

### Google Chrome / Microsoft Edge
1. Navigate to `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (toggle in the upper right corner).
3. Click **Load unpacked** in the top left.
4. Select the `qr-snip` project directory.
5. Confirm that **QR Snip** appears in your extensions list. Pin it to the toolbar.

> **Note on Chrome Developer Warning:**
> Chrome may display an informational notice: `"Unrecognized manifest key 'scripts'"`. This is normal and expected when using a shared manifest with Firefox MV3 background script compatibility. Chrome loads `service_worker` and functions normally.

---

### Mozilla Firefox (140+)
1. Open Firefox and navigate to:
   ```text
   about:debugging#/runtime/this-firefox
   ```
2. Click the **Load Temporary Add-on...** button.
3. Browse into the `qr-snip` project directory and select [manifest.json](manifest.json).
4. Confirm **QR Snip** appears under **Temporary Extensions**.
5. Pin the extension to your Firefox toolbar if needed.

> **Note on Temporary Add-ons:**
> Temporary add-ons in Firefox remain active during your current session and are automatically unloaded when Firefox completely restarts.

---

## 2. Test Verification Checklist

Open the local test suite page [test.html](test.html) in your browser:
```text
file:///d:/projects/test.html
```

Perform the following validation tests:

| # | Test Case | Action | Expected Result |
|---|---|---|---|
| **1** | **Toolbar Icon Click** | Click the QR Snip extension icon in the toolbar. | Screen dims, instructions badge appears: *"Drag a box over the QR code • Esc to cancel"*. |
| **2** | **Keyboard Shortcut** | Press <kbd>Alt+Shift+Q</kbd>. | Overlay activates identically to clicking the toolbar icon. |
| **3** | **Drag-to-Snip Selection** | Drag a bounding box over Card #1 (`https://github.com/google`). | Toast appears at the top. The domain **github.com** is bolded. Clicking **"Open link"** opens GitHub in a new tab. |
| **4** | **Right-Click Image Scan** | Right-click directly on the QR code image in Card #1 and choose **"Scan QR in this image"**. | Image is scanned and decoded directly without needing to drag an area. |
| **5** | **Plain Text Decoding** | Drag-select Card #2 (*Plain Text*). | Displays raw text snippet and a **"Copy"** button. Clicking Copy changes button to **"Copied!"** for 2 seconds. |
| **6** | **Insecure HTTP Warning** | Drag-select Card #3 (`http://example.com/...`). | A **yellow caution banner** appears above the Open button warning: *"Insecure connection (HTTP)"*. |
| **7** | **URL Shortener Warning** | Drag-select Card #4 (`https://tinyurl.com/...`). | A **yellow caution banner** appears warning: *"Known URL shortener detected"*. |
| **8** | **Blocked Dangerous URL** | Drag-select Card #6 (`javascript:alert(1)`). | A **red danger alert** appears stating the dangerous protocol was blocked. The **"Open link" button is completely removed**; only "Copy content" is available. |
| **9** | **Restricted Page Notice** | Open an internal page (e.g. `chrome://extensions` or `about:debugging`) and click the icon or press <kbd>Alt+Shift+Q</kbd>. | A friendly notification explains that browser security prevents running extensions on internal pages, and an action badge (`!`) appears temporarily. |
| **10** | **Dark / Light Mode Toggle** | In the toast header, click the theme icon (🌓 / 🌙 / ☀️). | Toast switches between Dark, Light, and System Auto themes instantly. Preference persists across sessions. |
| **11** | **Escape Cancellation** | Start a snip or open a toast, then press <kbd>Esc</kbd>. | Selection overlay cancels immediately or result toast closes. |
