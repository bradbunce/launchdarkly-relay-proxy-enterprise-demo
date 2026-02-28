# Screenshot Capture Instructions

This document provides instructions for capturing screenshots of the JavaScript Client Panel for documentation purposes.

## Prerequisites

- LaunchDarkly Relay Proxy Enterprise Demo running locally
- Dashboard accessible at http://localhost:8000
- `dashboard-service-panel-1` flag set to 'javascript' in LaunchDarkly

## Required Screenshots

### 1. Panel Overview Screenshot
**Filename:** `panel-overview.png`

**Purpose:** Show the complete JavaScript Client panel with all major sections visible

**Steps to Capture:**
1. Open the dashboard at http://localhost:8000
2. Ensure the `dashboard-service-panel-1` flag is set to 'javascript'
3. Wait for the panel to fully load (green status indicator)
4. Ensure the panel shows:
   - Status indicator (green dot)
   - SDK Mode display ("Proxy Mode (Client-Side)")
   - Flag value display (showing 'user-message' flag value)
   - Current Context section
   - "Change Context" and "Test Flag Evaluation" buttons
   - Bucketing Hash Values section (collapsed)
   - SDK Data Store section
5. Take a full screenshot of Panel 1 area
6. Save as `panel-overview.png` in this directory

**Recommended Dimensions:** 800x1200px (capture full panel height)

---

### 2. Status Indicator Close-up
**Filename:** `status-indicator.png`

**Purpose:** Show the three-dot status indicator and its meanings

**Steps to Capture:**
1. Capture three separate screenshots showing each status state:
   - **Connected (Green):** Normal operation
   - **Connecting (Orange):** Refresh page and capture during initialization
   - **Disconnected (Red):** Stop relay proxy container and capture
2. Create a composite image showing all three states side-by-side
3. Add labels: "Disconnected", "Connecting", "Connected"
4. Save as `status-indicator.png`

**Alternative:** Capture just the green status with SDK Mode display and add annotations in documentation

**Recommended Dimensions:** 400x150px (close-up of status area)

---

### 3. Context Editor Modal
**Filename:** `context-editor.png`

**Purpose:** Show the context change modal with both Anonymous and Custom options

**Steps to Capture:**
1. Click the "Change Context" button
2. Ensure the modal is fully visible
3. Capture showing:
   - Modal title
   - Context type selector (Anonymous/Custom radio buttons)
   - Form fields (email, name, location)
   - Save and Cancel buttons
4. Optional: Capture two versions (Anonymous selected, Custom selected)
5. Save as `context-editor.png`

**Recommended Dimensions:** 600x500px (modal dialog)

---

### 4. Hash Values Expanded
**Filename:** `hash-values-expanded.png`

**Purpose:** Show the bucketing hash calculation details

**Steps to Capture:**
1. Locate the "Bucketing Hash Values" section
2. Click "Show" to expand the section
3. Ensure all hash information is visible:
   - Context Key
   - Salt
   - Hash Value
   - Bucket Value
4. Take a screenshot of the expanded section
5. Save as `hash-values-expanded.png`

**Recommended Dimensions:** 700x300px (section only)

---

### 5. SDK Data Store Display
**Filename:** `sdk-data-store.png`

**Purpose:** Show the raw flag configurations displayed in the SDK Data Store section

**Steps to Capture:**
1. Scroll to the "SDK Data Store" section
2. Ensure the JSON data is visible and formatted
3. Capture showing:
   - Section title
   - Timestamp (if visible)
   - Raw flag configuration JSON
   - At least one complete flag object with variations, rules, etc.
4. Save as `sdk-data-store.png`

**Recommended Dimensions:** 800x600px (enough to show meaningful JSON structure)

---

## Screenshot Guidelines

### Technical Requirements
- **Format:** PNG (preferred) or JPEG
- **Resolution:** At least 72 DPI for web display
- **Color Space:** RGB
- **Compression:** Optimize for web (keep file size under 500KB per image)

### Capture Best Practices
- Use a clean browser window (no extensions visible, no bookmarks bar)
- Ensure good contrast and readability
- Capture at 100% zoom level (no browser zoom applied)
- Use consistent browser width across screenshots (recommend 1280px)
- Ensure all text is sharp and readable
- Remove any sensitive information (API keys, email addresses if needed)

### Tools
- **macOS:** Cmd+Shift+4 (select area) or Cmd+Shift+3 (full screen)
- **Windows:** Snipping Tool or Win+Shift+S
- **Linux:** gnome-screenshot or Spectacle
- **Browser Extensions:** Awesome Screenshot, Nimbus Screenshot

### Post-Processing
- Crop to relevant area only
- Add subtle border if needed for clarity (1px gray)
- Optimize file size using tools like TinyPNG or ImageOptim
- Verify text is readable at documentation display size

## Verification Checklist

Before considering screenshots complete, verify:

- [ ] All 5 required screenshots captured
- [ ] Images are clear and readable
- [ ] No sensitive information visible
- [ ] File sizes optimized for web
- [ ] Filenames match exactly as specified
- [ ] Images placed in correct directory (`docs/javascript-client-panel/images/`)
- [ ] All UI elements mentioned in requirements are visible
- [ ] Screenshots represent current UI state accurately

## Notes

- Screenshots should be updated whenever the UI changes significantly
- Keep original high-resolution versions for future editing
- Consider capturing at 2x resolution for Retina displays, then scale down
- Document the date screenshots were captured for version tracking
- If UI changes frequently, consider using automated screenshot tools

## Automated Screenshot Capture (Optional)

For automated screenshot capture, consider using Puppeteer:

```javascript
const puppeteer = require('puppeteer');

async function captureScreenshots() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1024 });
  
  // Navigate to dashboard
  await page.goto('http://localhost:8000');
  
  // Wait for panel to load
  await page.waitForSelector('.javascript-client-panel');
  
  // Capture panel overview
  const panel = await page.$('.javascript-client-panel');
  await panel.screenshot({ path: 'panel-overview.png' });
  
  // Add more screenshot logic here...
  
  await browser.close();
}
```

This approach ensures consistent, reproducible screenshots across documentation updates.
