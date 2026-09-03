export interface UserSettings {
  defaultFollowUpPromptDays: number;
  contactsDisplayMode: "side_panel" | "modal";
  addJobFormLayout: "long_form" | "stepped";
  addJobPresentation: "modal" | "page";
  visibleApplicationColumns: string[];
  rememberTableState: boolean;
  enableNotificationBell: boolean;
}
