# Design Document

## Overview

This design implements session traffic totals that reset when the browser closes completely. The current implementation maintains session totals in the service worker's in-memory state, but service workers can persist across browser restarts. This design ensures that session totals truly represent the current browser session by resetting them on browser startup.

The solution leverages Chrome's `chrome.runtime.onStartup` event, which fires only when the browser starts (not when the extension reloads or updates). This event provides a reliable signal for browser session boundaries.

## Architecture

The architecture maintains the existing state management pattern while adding explicit reset logic:

```
Browser Startup
    ↓
chrome.runtime.onStartup event
    ↓
resetSessionTotals()
    ↓
state.sessionTotals = { pageDownloadBytes: 0, pageUploadBytes: 0, downloadManagerBytes: 0 }
    ↓
Normal traffic tracking continues
```

The existing traffic tracking mechanisms remain unchanged:
- `recordNetBytes()` continues to accumulate traffic from debugger events
- `recordNetRange()` continues to handle upload traffic distribution
- `syncActiveDownloads()` continues to track download manager progress
- UI continues to display totals from `state.sessionTotals`

## Components and Interfaces

### Modified Components

#### background.js

**State Structure** (unchanged):
```javascript
state.sessionTotals = {
  pageDownloadBytes: 0,
  pageUploadBytes: 0,
  downloadManagerBytes: 0
}
```

**New Function**:
```javascript
function resetSessionTotals() {
  state.sessionTotals.pageDownloadBytes = 0;
  state.sessionTotals.pageUploadBytes = 0;
  state.sessionTotals.downloadManagerBytes = 0;
}
```

**Modified Event Handlers**:
- `chrome.runtime.onStartup`: Add call to `resetSessionTotals()`
- `init()`: Add call to `resetSessionTotals()` to handle extension install/update

### Unchanged Components

- `content.js`: No changes required (reads totals from snapshot)
- `options.js`: No changes required (no settings for this feature)
- `pageHookMain.js`: No changes required (only reports traffic events)

### Event Flow

**Browser Startup Sequence**:
1. Browser starts → `chrome.runtime.onStartup` fires
2. `resetSessionTotals()` zeros all counters
3. `init()` completes normal initialization
4. Traffic tracking begins with clean totals

**Extension Install/Update Sequence**:
1. Extension installed/updated → `chrome.runtime.onInstalled` fires
2. `init()` runs and calls `resetSessionTotals()`
3. Settings are normalized and saved
4. Traffic tracking begins with clean totals

**Service Worker Restart During Session**:
1. Service worker restarts (browser still open)
2. `init()` runs and calls `resetSessionTotals()`
3. Totals reset to zero (acceptable behavior per requirements)

## Data Models

No new data models are introduced. The existing `state.sessionTotals` structure remains:

```javascript
{
  pageDownloadBytes: number,      // Traffic from page loads (debugger)
  pageUploadBytes: number,         // Traffic from XHR/fetch/WebSocket
  downloadManagerBytes: number     // Traffic from chrome.downloads API
}
```

**Invariants**:
- All values are non-negative integers
- Values only increase during a session (never decrease except on reset)
- Values reset to exactly 0 on browser startup


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Traffic Accumulation

*For any* traffic event (page download, page upload, or download manager) with N bytes, recording that traffic should increase the corresponding session total counter by exactly N bytes.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 2: Display Calculation Correctness

*For any* values of pageDownloadBytes, pageUploadBytes, and downloadManagerBytes in state, the snapshot returned by `buildSnapshot()` should have `totals.downloadBytes` equal to `pageDownloadBytes + downloadManagerBytes` and `totals.uploadBytes` equal to `pageUploadBytes`.

**Validates: Requirements 3.3, 3.4, 3.5**

### Property 3: Session Totals Non-Persistence

*For any* sequence of operations (traffic recording, snapshot building, settings changes), the session totals should never be written to `chrome.storage.sync` or `chrome.storage.local`.

**Validates: Requirements 4.2**

## Error Handling

### Service Worker Lifecycle

**Service Worker Restart**: When the service worker restarts during a browser session, session totals will reset to zero. This is acceptable behavior per Requirement 1.3, as it's difficult to distinguish between browser restart and service worker restart without persistent storage.

**Mitigation**: Document this behavior in user-facing materials. Service worker restarts are rare in normal usage.

### Chrome API Failures

**Storage API Failures**: If `chrome.storage.sync.get()` fails during initialization, the extension falls back to `DEFAULT_SETTINGS`. Session totals initialization is independent of storage and will still reset correctly.

**Debugger API Failures**: If debugger attachment fails, traffic tracking for that tab is skipped, but session totals remain valid for other tabs. No special error handling needed.

### Edge Cases

**Rapid Browser Restart**: If the browser is closed and reopened quickly, the service worker might still be alive. However, `chrome.runtime.onStartup` will still fire, ensuring totals reset correctly.

**Extension Update During Session**: When the extension updates, `chrome.runtime.onInstalled` fires and `init()` resets totals. This is correct behavior per Requirement 1.2.

**Concurrent Traffic Events**: Multiple tabs may generate traffic simultaneously. The existing `recordNetBytes()` and `recordNetRange()` functions handle this correctly with simple addition operations (no race conditions in JavaScript's single-threaded model).

## Testing Strategy

### Unit Testing

Unit tests will verify specific behaviors and edge cases:

**Reset Behavior**:
- Test that `resetSessionTotals()` sets all three counters to exactly 0
- Test that reset works regardless of previous counter values

**Traffic Recording**:
- Test that `recordNetBytes()` correctly increments pageDownloadBytes and pageUploadBytes
- Test that `syncActiveDownloads()` correctly increments downloadManagerBytes
- Test that zero-byte traffic events don't modify counters

**Snapshot Building**:
- Test that `buildSnapshot()` correctly sums pageDownloadBytes + downloadManagerBytes for download total
- Test that `buildSnapshot()` correctly returns pageUploadBytes for upload total

**Event Handler Integration**:
- Test that `chrome.runtime.onStartup` handler calls reset function
- Test that `init()` calls reset function

### Property-Based Testing

Property-based tests will verify universal behaviors across all inputs. Each test should run a minimum of 100 iterations.

**Property 1: Traffic Accumulation**
- Generate random traffic events (download/upload/download manager)
- Record each event and verify counter increases by exact byte amount
- Tag: **Feature: browser-session-traffic-reset, Property 1: For any traffic event with N bytes, recording that traffic should increase the corresponding session total counter by exactly N bytes**

**Property 2: Display Calculation Correctness**
- Generate random values for all three session total counters
- Build snapshot and verify totals.downloadBytes = pageDownloadBytes + downloadManagerBytes
- Verify totals.uploadBytes = pageUploadBytes
- Tag: **Feature: browser-session-traffic-reset, Property 2: For any values of session counters, snapshot totals should correctly sum download bytes and return upload bytes**

**Property 3: Session Totals Non-Persistence**
- Generate random sequences of operations
- Verify that chrome.storage never contains sessionTotals keys
- Tag: **Feature: browser-session-traffic-reset, Property 3: For any sequence of operations, session totals should never be persisted to chrome.storage**

### Testing Library

Use **fast-check** for property-based testing in JavaScript. Configure each property test with:
```javascript
fc.assert(
  fc.property(/* generators */, (/* inputs */) => {
    // test logic
  }),
  { numRuns: 100 }
);
```

### Integration Testing

Manual testing scenarios:
1. Install extension → verify totals start at 0
2. Browse several sites → verify totals accumulate
3. Close browser completely → reopen → verify totals reset to 0
4. Update extension → verify totals reset to 0
5. Let service worker idle out → verify totals reset when it restarts

