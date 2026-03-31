# Requirements Document

## Introduction

This feature modifies the SpeedMeter Chrome extension to reset session traffic totals when the browser closes completely. Currently, session totals persist as long as the background service worker remains alive, which can span multiple browser sessions. This change ensures that "Session" totals truly represent traffic for the current browser session only.

## Glossary

- **Extension**: The SpeedMeter Chrome extension
- **Session_Totals**: The aggregate traffic counters tracking pageDownloadBytes, pageUploadBytes, and downloadManagerBytes
- **Browser_Session**: The period from when the user opens the browser until they close it completely
- **Service_Worker**: The background script that maintains the Extension state
- **UI**: The overlay interface displaying traffic statistics to the user

## Requirements

### Requirement 1: Reset Session Totals on Browser Start

**User Story:** As a user, I want session totals to reset when I start my browser, so that I can track traffic for each browser session independently.

#### Acceptance Criteria

1. WHEN the browser starts, THE Extension SHALL initialize Session_Totals to zero for all counters (pageDownloadBytes, pageUploadBytes, downloadManagerBytes)
2. WHEN the Extension is installed or updated, THE Extension SHALL initialize Session_Totals to zero
3. WHEN the Service_Worker restarts during a Browser_Session, THE Extension SHALL initialize Session_Totals to zero

### Requirement 2: Track Traffic During Browser Session

**User Story:** As a user, I want to see cumulative traffic for my current browser session, so that I can monitor my network usage.

#### Acceptance Criteria

1. WHILE the Browser_Session is active, THE Extension SHALL accumulate page download bytes into Session_Totals
2. WHILE the Browser_Session is active, THE Extension SHALL accumulate page upload bytes into Session_Totals
3. WHILE the Browser_Session is active, THE Extension SHALL accumulate download manager bytes into Session_Totals
4. THE Extension SHALL include traffic from all tabs in Session_Totals

### Requirement 3: Display Session Totals in UI

**User Story:** As a user, I want to see session download and upload totals in the overlay, so that I can quickly understand my current session's network usage.

#### Acceptance Criteria

1. THE UI SHALL display session download total as "Session ↓" in the SESSION TOTALS section
2. THE UI SHALL display session upload total as "Session ↑" in the SESSION TOTALS section
3. THE UI SHALL calculate session download total as the sum of pageDownloadBytes and downloadManagerBytes
4. THE UI SHALL display session upload total as pageUploadBytes
5. WHEN Session_Totals are updated, THE UI SHALL reflect the new values

### Requirement 4: Maintain Session Totals Accuracy

**User Story:** As a user, I want accurate session totals, so that I can trust the traffic measurements.

#### Acceptance Criteria

1. THE Extension SHALL increment Session_Totals only when actual network traffic occurs
2. THE Extension SHALL NOT persist Session_Totals to chrome.storage
3. THE Extension SHALL maintain Session_Totals in memory within the Service_Worker state
4. WHEN network traffic is measured, THE Extension SHALL update Session_Totals before updating the UI
