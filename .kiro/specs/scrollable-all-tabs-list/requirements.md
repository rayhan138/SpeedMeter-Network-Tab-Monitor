# Requirements Document

## Introduction

This feature modifies the "TOP TABS BY MEMORY" section in the SpeedMeter Chrome extension to display all open tabs instead of limiting to the top 5-10 tabs. The tab list will become scrollable within the existing red-boxed area while maintaining the current sorting behavior (by memory usage, then by download speed).

## Glossary

- **Tab_List_Component**: The UI component in content.js that renders the list of tabs in the "TOP TABS BY MEMORY" section
- **Tab_Data_Provider**: The getTopTabs() function in background.js that retrieves and sorts tab data
- **Overlay_Container**: The floating interface that displays the SpeedMeter UI with fixed dimensions
- **Scrollable_Region**: The container area within the tab list section that allows vertical scrolling

## Requirements

### Requirement 1: Display All Open Tabs

**User Story:** As a user, I want to see all my open tabs in the memory list, so that I can monitor and manage all tabs regardless of their memory usage.

#### Acceptance Criteria

1. THE Tab_Data_Provider SHALL return all open tabs without applying a limit
2. THE Tab_List_Component SHALL render all tabs returned by the Tab_Data_Provider
3. THE Tab_Data_Provider SHALL maintain the existing sort order (by memory usage descending, then by download speed descending)

### Requirement 2: Scrollable Tab List Container

**User Story:** As a user, I want the tab list to be scrollable, so that I can view all tabs without expanding the overlay size.

#### Acceptance Criteria

1. THE Scrollable_Region SHALL constrain the tab list to a fixed maximum height
2. WHEN the tab list content exceeds the maximum height, THE Scrollable_Region SHALL display a vertical scrollbar
3. THE Scrollable_Region SHALL allow vertical scrolling to access all tab entries
4. THE Overlay_Container SHALL maintain its current fixed dimensions

### Requirement 3: Preserve Existing UI Behavior

**User Story:** As a user, I want the tab list to maintain its current appearance and interactions, so that the feature feels consistent with the existing interface.

#### Acceptance Criteria

1. THE Tab_List_Component SHALL preserve the existing visual styling for tab entries
2. THE Tab_List_Component SHALL preserve the existing click behavior for tab activation
3. THE Tab_List_Component SHALL preserve the existing context menu behavior for tab actions
4. THE Tab_List_Component SHALL preserve the top tab highlighting (outline accent)
5. THE Scrollable_Region SHALL use styling consistent with the existing theme system

### Requirement 4: Remove Tab Limit Configuration

**User Story:** As a user, I no longer need the "tabs to show" setting, so that the interface is simplified.

#### Acceptance Criteria

1. THE Tab_Data_Provider SHALL ignore the state.settings.tabsToShow configuration value
2. THE Tab_Data_Provider SHALL remove the hardcoded limit logic (Math.min(10, Math.max(5, ...)))
