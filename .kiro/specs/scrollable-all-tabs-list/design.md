# Design Document

## Overview

This feature transforms the "TOP TABS BY MEMORY" section from a limited list (5-10 tabs) to a scrollable list displaying all open tabs. The change involves two primary modifications:

1. **Backend**: Remove the limit logic in `getTopTabs()` to return all tabs
2. **Frontend**: Add CSS overflow scrolling to the tab list container

The existing sort order (memory descending, then download speed descending) and all tab interactions (click to activate, right-click menu) remain unchanged. The overlay container maintains its fixed dimensions while the tab list becomes internally scrollable.

## Architecture

### Component Interaction Flow

```
background.js (getTopTabs)
    ↓ [returns all tabs, sorted]
chrome.runtime.sendMessage
    ↓ [snapshot with tabs array]
content.js (render)
    ↓ [builds HTML for all tabs]
#tabsList container
    ↓ [CSS overflow: auto]
Scrollable UI
```

### Modified Components

1. **background.js::getTopTabs()**: Remove limit logic, return all tabs
2. **content.js::#tabsList**: Add scrollable container styling
3. **options.html + options.js**: Remove "Tabs to show" setting (optional cleanup)

### Unchanged Components

- Tab sorting logic (memory → download speed)
- Tab rendering HTML structure
- Tab interaction handlers (click, context menu)
- Overlay positioning and dragging
- Theme system and styling

## Components and Interfaces

### Background Service (background.js)

#### Modified Function: getTopTabs()

**Current Implementation:**
```javascript
function getTopTabs() {
  const limit = Math.min(10, Math.max(5, Number(state.settings.tabsToShow) || 5));
  
  return [...state.tabs.entries()]
    .map(/* ... */)
    .sort(/* ... */)
    .slice(0, limit);  // ← Remove this limit
}
```

**New Implementation:**
```javascript
function getTopTabs() {
  return [...state.tabs.entries()]
    .map((tabId, tab) => ({
      tabId,
      ...tab,
      downBps: getTabNetBps(tabId, 1000).downBps,
      upBps: getTabNetBps(tabId, 1000).upBps
    }))
    .sort((a, b) => {
      const am = Number.isFinite(a.memoryMB) ? a.memoryMB : -1;
      const bm = Number.isFinite(b.memoryMB) ? b.memoryMB : -1;
      if (bm !== am) return bm - am;
      return (b.downBps || 0) - (a.downBps || 0);
    });
  // No .slice() call - return all tabs
}
```

**Changes:**
- Remove `limit` variable calculation
- Remove `.slice(0, limit)` call
- Ignore `state.settings.tabsToShow` value

### Content Script (content.js)

#### Modified Styling: #tabsList Container

**Current State:**
- No explicit height constraint
- No overflow handling
- List grows vertically without bounds

**New Styling:**
```css
#tabsList {
  max-height: 240px;  /* Approximately 5-6 tab rows */
  overflow-y: auto;
  overflow-x: hidden;
}

/* Scrollbar styling for theme consistency */
#tabsList::-webkit-scrollbar {
  width: 6px;
}

#tabsList::-webkit-scrollbar-track {
  background: transparent;
}

#tabsList::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

#tabsList::-webkit-scrollbar-thumb:hover {
  background: var(--muted);
}
```

**Rationale:**
- `max-height: 240px` allows ~5-6 visible tabs (each row is ~40px)
- `overflow-y: auto` shows scrollbar only when needed
- Custom scrollbar styling maintains theme consistency
- Uses existing CSS variables for colors

#### Unchanged Functions

- `buildTabsHTML(tabs)`: Continues to render all provided tabs
- Tab click handler: Activates tab via `activateTab` message
- Tab context menu handler: Shows reload/close options
- `render(snapshot)`: No changes to tab rendering logic

### Settings UI (options.html/options.js) - Optional Cleanup

The `tabsToShow` setting becomes obsolete but can remain for backward compatibility. If removing:

**options.html**: Remove the "Tabs to show" row
**options.js**: Remove `tabsToShow` from save/load logic
**background.js**: Already ignores this value in new implementation

## Data Models

### Tab Entry Structure (Unchanged)

```typescript
interface TabEntry {
  tabId: number;
  title: string;
  faviconUrl: string;
  url: string;
  memoryMB: number | null;
  memorySource: "heap" | "estimate" | "na";
  usedHeapBytes: number | null;
  domNodes: number;
  downBps: number;  // Added by getTopTabs()
  upBps: number;    // Added by getTopTabs()
  lastSeen: number;
  lastAlertAt: number;
}
```

### Snapshot Structure (Unchanged)

```typescript
interface Snapshot {
  settings: Settings;
  speeds: {
    downloadBps: number;
    uploadBps: number;
    exactDownloadBps: number;
  };
  totals: {
    downloadBytes: number;
    uploadBytes: number;
  };
  totalEstimatedMemoryMB: number;
  tabCount: number;
  tabs: TabEntry[];  // Now contains all tabs instead of limited subset
  activeDownloads: Download[];
  history: {
    download: number[];
    upload: number[];
    memory: number[];
  };
}
```

**Key Change**: The `tabs` array now contains all open tabs rather than a limited subset.


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing the acceptance criteria, several properties can be consolidated:

- Properties 2.1, 2.2, 2.3 all relate to CSS configuration and can be verified through a single example test
- Properties 3.1, 3.2, 3.3, 3.5 are all example-based verifications of existing behavior preservation
- Property 1.1 and 4.1 both verify that all tabs are returned regardless of settings

### Property 1: All tabs returned without limit

*For any* set of open tabs in state.tabs, calling getTopTabs() should return a count equal to the number of tabs in state.tabs (no artificial limit applied)

**Validates: Requirements 1.1, 4.1**

### Property 2: Sort order preservation

*For any* set of tabs with varying memory and download speeds, the returned tabs should be sorted first by memory (descending, with null/-1 treated as lowest), then by download speed (descending)

**Validates: Requirements 1.3**

### Property 3: Complete rendering

*For any* array of tab entries, buildTabsHTML() should produce HTML containing exactly one .row element per tab entry

**Validates: Requirements 1.2**

### Property 4: Top tab highlighting

*For any* non-empty array of tabs, the first tab in the rendered HTML should have the "top" CSS class applied

**Validates: Requirements 3.4**

## Error Handling

### Potential Issues

1. **Large tab counts (100+ tabs)**: 
   - Risk: Performance degradation in rendering
   - Mitigation: Browser handles DOM efficiently; scrolling is native
   - Fallback: If performance issues arise, consider virtual scrolling

2. **Missing tab data**:
   - Risk: Tabs with null/undefined properties
   - Mitigation: Existing code already handles null memoryMB gracefully
   - No additional error handling needed

3. **Scrollbar visibility**:
   - Risk: Scrollbar appears/disappears based on content
   - Mitigation: CSS `overflow-y: auto` handles this automatically
   - No error state needed

### Error Boundaries

No new error boundaries required. The existing error handling in:
- `chrome.runtime.sendMessage` catch blocks
- `refreshSnapshot()` try-catch
- Tab event listeners error handling

...all remain sufficient for this feature.

## Testing Strategy

### Unit Testing

Focus on specific examples and edge cases:

1. **Example: Empty tab list**
   - Verify buildTabsHTML([]) returns empty state message
   - Verify no scrollbar appears

2. **Example: Single tab**
   - Verify single tab renders with "top" class
   - Verify no scrollbar needed

3. **Example: CSS properties**
   - Verify #tabsList has max-height: 240px
   - Verify overflow-y: auto is set
   - Verify scrollbar styling uses theme variables

4. **Example: Settings ignored**
   - Set tabsToShow to 5, create 20 tabs
   - Verify getTopTabs() returns 20 tabs

5. **Edge case: Tabs with null memory**
   - Create tabs with mix of null and valid memory values
   - Verify sort places null memory tabs at end

### Property-Based Testing

Use **fast-check** (JavaScript property-based testing library) with minimum 100 iterations per test.

Each property test must include a comment tag:
```javascript
// Feature: scrollable-all-tabs-list, Property {N}: {property text}
```

#### Property Test 1: All tabs returned

```javascript
// Feature: scrollable-all-tabs-list, Property 1: For any set of open tabs in state.tabs, calling getTopTabs() should return a count equal to the number of tabs in state.tabs
fc.assert(
  fc.property(
    fc.array(fc.record({
      tabId: fc.integer(),
      title: fc.string(),
      url: fc.webUrl(),
      memoryMB: fc.option(fc.float({ min: 0, max: 5000 })),
      // ... other tab properties
    }), { minLength: 0, maxLength: 200 }),
    (tabs) => {
      // Setup state.tabs with generated tabs
      // Call getTopTabs()
      // Assert: result.length === tabs.length
    }
  ),
  { numRuns: 100 }
);
```

#### Property Test 2: Sort order preservation

```javascript
// Feature: scrollable-all-tabs-list, Property 2: For any set of tabs with varying memory and download speeds, the returned tabs should be sorted first by memory (descending), then by download speed (descending)
fc.assert(
  fc.property(
    fc.array(fc.record({
      memoryMB: fc.option(fc.float({ min: 0, max: 5000 })),
      downBps: fc.float({ min: 0, max: 100000000 })
    }), { minLength: 2, maxLength: 100 }),
    (tabs) => {
      // Call getTopTabs() with generated tabs
      // Verify each adjacent pair satisfies sort order
    }
  ),
  { numRuns: 100 }
);
```

#### Property Test 3: Complete rendering

```javascript
// Feature: scrollable-all-tabs-list, Property 3: For any array of tab entries, buildTabsHTML() should produce HTML containing exactly one .row element per tab entry
fc.assert(
  fc.property(
    fc.array(fc.record({
      tabId: fc.integer(),
      title: fc.string(),
      url: fc.webUrl(),
      faviconUrl: fc.string(),
      memoryMB: fc.option(fc.float({ min: 0, max: 5000 })),
      downBps: fc.float({ min: 0, max: 100000000 }),
      upBps: fc.float({ min: 0, max: 100000000 })
    }), { minLength: 0, maxLength: 200 }),
    (tabs) => {
      const html = buildTabsHTML(tabs);
      const rowCount = (html.match(/class="row/g) || []).length;
      return rowCount === tabs.length;
    }
  ),
  { numRuns: 100 }
);
```

#### Property Test 4: Top tab highlighting

```javascript
// Feature: scrollable-all-tabs-list, Property 4: For any non-empty array of tabs, the first tab in the rendered HTML should have the "top" CSS class applied
fc.assert(
  fc.property(
    fc.array(fc.record({
      tabId: fc.integer(),
      title: fc.string(),
      url: fc.webUrl(),
      faviconUrl: fc.string(),
      memoryMB: fc.option(fc.float({ min: 0, max: 5000 })),
      downBps: fc.float({ min: 0, max: 100000000 }),
      upBps: fc.float({ min: 0, max: 100000000 })
    }), { minLength: 1, maxLength: 200 }),
    (tabs) => {
      const html = buildTabsHTML(tabs);
      const firstRowMatch = html.match(/class="row[^"]*"/);
      return firstRowMatch && firstRowMatch[0].includes("top");
    }
  ),
  { numRuns: 100 }
);
```

### Integration Testing

1. **Manual verification with real browser tabs**:
   - Open 20+ tabs
   - Verify all tabs appear in list
   - Verify scrollbar appears
   - Verify scroll functionality works
   - Verify top tab has accent outline
   - Verify click/context menu still work

2. **Theme consistency**:
   - Test scrollbar appearance in dark/light/ocean themes
   - Verify scrollbar colors match theme variables

3. **Performance testing**:
   - Test with 50, 100, 200 tabs
   - Verify rendering performance remains acceptable
   - Verify scrolling is smooth

### Test Configuration

- **Framework**: Jest or Mocha for unit tests
- **PBT Library**: fast-check (JavaScript/TypeScript)
- **Minimum iterations**: 100 per property test
- **Test location**: Create `tests/` directory in project root
- **Test files**: 
  - `tests/background.test.js` (for getTopTabs)
  - `tests/content.test.js` (for buildTabsHTML)

