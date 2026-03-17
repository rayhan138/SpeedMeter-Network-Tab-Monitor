# Privacy Policy for SpeedMeter Overlay

**Effective Date:** March 2026

This Privacy Policy applies to the **SpeedMeter Overlay** Chrome Extension ("the Extension"). We believe in absolute transparency and user privacy. Because this Extension monitors system and network performance, it is built with a strict **local-only** architecture. 

## 1. Data Collection and Usage
**SpeedMeter Overlay does not collect, store, or transmit any personal data, browsing history, or network payloads.** 

All performance metrics—including upload/download speeds, memory usage, and active file downloads—are calculated entirely locally within your browser's memory. The data is displayed to you in real-time via the overlay and is instantly discarded. It never leaves your machine.

## 2. How We Use Permissions
To provide real-time monitoring, the Extension requires specific browser permissions. Here is exactly how they are used locally:
*   **Debugger & Network Traffic (`debugger`):** Used strictly to calculate the size (in bytes) of incoming and outgoing web traffic to calculate bandwidth speed. We do not read, intercept, or save the contents of your web traffic.
*   **Downloads (`downloads`):** Used to read the active download progress to calculate the exact MB/s of files currently downloading. We do not access or modify the downloaded files.
*   **Webpage Access (`<all_urls>`):** Used solely to inject the visual, draggable dashboard onto the screen so you can view your stats while browsing.
*   **Tab Data (`tabs`):** Used to read the titles of your open tabs so we can display which specific tabs are consuming the most memory.

## 3. Data Storage
The only data saved by the Extension is your **User Preferences**. This includes:
*   The X/Y screen coordinates of where you dragged the overlay.
*   Your UI configurations (e.g., collapsed/expanded state).
This data is stored locally on your device using Chrome's `storage.local` API. It is not synced to our servers (because we don't have any) and can be cleared at any time by uninstalling the Extension.

## 4. Third-Party Services and Tracking
SpeedMeter Overlay contains **zero** third-party analytics, tracking scripts, or advertising frameworks. We do not sell, rent, or share any data with any third parties, as we do not collect any data to begin with.

## 5. Changes to This Policy
If we make changes to our permissions or data handling practices, we will update this Privacy Policy and explicitly note the changes in the Chrome Web Store update logs.

## 6. Contact Us
If you have any questions or concerns regarding your privacy or the technical architecture of this extension, please contact us at: **[Insert Your Email Address / GitHub Repository Link]**.