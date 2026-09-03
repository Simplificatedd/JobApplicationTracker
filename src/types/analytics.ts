export interface AnalyticsSettings {
  enabled: boolean;
  defaultTimeGrouping: "daily" | "weekly" | "monthly";
  visibleCharts: string[];
  includeArchived: boolean;
}
