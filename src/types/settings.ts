export interface UserSettings {
  defaultFollowUpPromptDays: number;
  contactsDisplayMode: "side_panel" | "modal";
  navigationDisplayMode: "side" | "top";
  addJobFormLayout: "long_form" | "stepped";
  addJobPresentation: "modal" | "page";
  visibleApplicationColumns: string[];
  enableDraggableColumnWidths: boolean;
  rememberTableState: boolean;
  enableDeleteActiveApplications: boolean;
  enableNotificationBell: boolean;
  enableGroupedNotifications: boolean;
  includeUpcomingInterviewsInAttention: boolean;
  dueSoonDays: number;
  betaAnalyticsEnabled: boolean;
}

export interface NotificationState {
  dismissedNotificationIds: string[];
  lastOpenedAt?: string;
}
