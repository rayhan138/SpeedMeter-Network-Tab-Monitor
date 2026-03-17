# Permissions Justification for SpeedMeter Overlay

Below is the technical justification for each requested permission, explicitly detailing how they provide core functionality to the user.

*   **`tabs`**
    Used to retrieve the titles and IDs of currently open tabs. This allows the extension to map performance data to specific pages, displaying a live leaderboard in the overlay so the user knows exactly which tabs are consuming the most system memory.
    
*   **`storage`**
    Used exclusively for local persistence of user preferences. This saves the X/Y pixel coordinates of the draggable overlay (so it remembers its exact position across sessions), as well as user configurations like opacity and UI toggle states.
    
*   **`downloads`**
    Used to read the byte-progress of active file downloads in Chrome's native download manager. This allows the extension to calculate and display the exact MB/s speed and filename of actively downloading files to the user in real-time. No file contents are read, modified, or saved.
    
*   **`notifications`**
    Used to send native browser alerts to the user. If a specific tab exceeds a dangerous memory threshold (e.g., a memory leak causing a tab to use over 1GB of RAM), the extension uses this to warn the user before the browser crashes.
    
*   **`debugger`**
    Used strictly to attach to the Chrome DevTools Protocol to fetch hyper-accurate, real-time aggregate network bandwidth (upload and download speeds) across all active tabs. This provides power-users with precision network monitoring without relying on estimations. **No network payload data is logged, saved, or transmitted.**
    
*   **`host_permissions` (`<all_urls>`)**
    Required to inject the floating SpeedMeter UI overlay (via a content script) onto whichever webpage the user is currently viewing. This ensures the performance dashboard remains visible, draggable, and interactive regardless of the site the user navigates to.