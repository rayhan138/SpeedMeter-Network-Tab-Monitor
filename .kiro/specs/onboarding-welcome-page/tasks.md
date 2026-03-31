# Implementation Plan: Onboarding Welcome Page

## Overview

This implementation adds first-install onboarding by modifying the existing `chrome.runtime.onInstalled` listener in background.js to detect first installs and open the welcome page at speedmeter.blinkeye.app. The implementation maintains all existing initialization logic and adds graceful error handling for the new welcome page functionality.

## Tasks

- [x] 1. Add welcome page URL constant and modify onInstalled listener
  - Add `WELCOME_PAGE_URL` constant at top of background.js
  - Modify existing `chrome.runtime.onInstalled` listener to check `details.reason`
  - If reason is "install", call `chrome.tabs.create` with welcome page URL
  - Wrap tab creation in try-catch with console.error logging
  - Ensure settings initialization completes before opening welcome page
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_

- [ ]* 1.1 Write unit tests for onInstalled listener
  - **Example 1: First install opens welcome page**
  - **Validates: Requirements 1.1, 1.3**
  - **Example 2: Updates do not open welcome page**
  - **Validates: Requirements 1.2**
  - **Example 3: Welcome page opens in new tab**
  - **Validates: Requirements 1.4**
  - **Example 4: Settings initialize before welcome page**
  - **Validates: Requirements 2.1**
  - **Example 5: Welcome page opens despite settings failure**
  - **Validates: Requirements 2.3**
  - **Example 6: Tab creation errors are logged and handled**
  - **Validates: Requirements 3.1, 3.2**
  - **Example 7: No notifications on welcome page failure**
  - **Validates: Requirements 3.3**

- [x] 2. Checkpoint - Test the implementation manually
  - Install extension in clean Chrome profile to verify welcome page opens
  - Verify extension functions normally after install
  - Test with network disconnected to verify graceful error handling
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Task 1.1 is marked optional for faster MVP delivery
- The implementation is minimal - only modifying the existing onInstalled listener
- All requirements are covered in a single implementation task due to the simplicity of the feature
- Manual testing checkpoint ensures the feature works in real browser environment
