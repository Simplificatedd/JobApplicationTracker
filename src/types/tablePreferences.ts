import type {
  ApplicationFilters,
  SortState,
} from "../features/applications/applicationFilters";

export interface TablePreferences {
  columnWidths: Record<string, number>;
  filters: ApplicationFilters;
  needsAttentionOnly: boolean;
  searchQuery: string;
  sort: SortState;
  visibleApplicationColumns: string[];
}
