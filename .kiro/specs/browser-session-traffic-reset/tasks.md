# Implementation Plan: Browser Session Traffic Reset

## Overview

Implement session traffic totals that reset when the browser starts. This involves adding a reset function and calling it from the appropriate lifecycle events in background.js. The existing traffic tracking mechanisms remain unchanged.

## Tasks

- [x] 1. Implement session totals reset function
  - Add `resetSessionTotals()` function to background.js that zeros all three session total counters
  - _Requirements: 1.1, 1.2, 1.3_

- [ ]* 1.1 Write property test for reset function
  - **Property 1: Traffic Accumulation**
  - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

- [x] 2. Wire reset function to browser lifecycle events
  - [x] 2.1 Call `resetSessionTotals()` in `chrome.runtime.onStartup` listener
    - Ensure reset happens before any traffic tracking begins
    - _Requirements: 1.1_
  
  - [x] 2.2 Call `resetSessionTotals()` in `init()` function
    - Handle extension install, update, and service worker restart scenarios
    - _Requirements: 1.2, 1.3_

- [ ]* 2.3 Write property test for display calculation
  - **Property 2: Display Calculation Correctness**
  - **Validates: Requirements 3.3, 3.4, 3.5**

- [x] 3. Checkpoint - Verify reset behavior
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 4. Write property test for non-persistence
  - **Property 3: Session Totals Non-Persistence**
  - **Validates: Requirements 4.2**

- [x] 5. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster implementation
- The existing traffic tracking functions (recordNetBytes, recordNetRange, syncActiveDownloads) require no modifications
- The UI automatically reflects session totals from state.sessionTotals through buildSnapshot()
- Service worker restarts during a browser session will reset totals (acceptable per requirements)
