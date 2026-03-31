# Implementation Plan: Scrollable All Tabs List

## Overview

This implementation removes the tab limit from the "TOP TABS BY MEMORY" section and makes the list scrollable. The changes are minimal: remove the limit logic in `background.js::getTopTabs()` and add CSS overflow scrolling to `#tabsList` in `content.js`.

## Tasks

- [x] 1. Remove tab limit logic in background.js
  - [x] 1.1 Modify getTopTabs() to return all tabs
    - Remove the `limit` variable calculation
    - Remove the `.slice(0, limit)` call at the end of the function
    - Keep all existing sorting logic unchanged
    - _Requirements: 1.1, 4.1, 4.2_
  
  - [ ]* 1.2 Write property test for all tabs returned
    - **Property 1: All tabs returned without limit**
    - **Validates: Requirements 1.1, 4.1**
  
  - [ ]* 1.3 Write property test for sort order preservation
    - **Property 2: Sort order preservation**
    - **Validates: Requirements 1.3**

- [x] 2. Add scrollable styling to tab list container
  - [x] 2.1 Add CSS for scrollable #tabsList container
    - Add `max-height: 240px` to constrain visible area
    - Add `overflow-y: auto` and `overflow-x: hidden`
    - Add custom scrollbar styling using theme CSS variables
    - _Requirements: 2.1, 2.2, 2.3, 3.5_
  
  - [ ]* 2.2 Write property test for complete rendering
    - **Property 3: Complete rendering**
    - **Validates: Requirements 1.2**
  
  - [ ]* 2.3 Write property test for top tab highlighting
    - **Property 4: Top tab highlighting**
    - **Validates: Requirements 3.4**

- [x] 3. Checkpoint - Verify functionality
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use fast-check library with minimum 100 iterations
- Existing tab interactions (click, context menu) remain unchanged
- The overlay container maintains its fixed dimensions
