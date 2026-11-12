import type {
  ApplicationFilters,
  SortState,
} from "../features/applications/applicationFilters";

export interface TablePreferences {
  columnWidths: Record<string, number>;
  filters: ApplicationFilters;
  // Optional so preferences saved before the Active/Total table toggle load.
  includeArchived?: boolean;
  needsAttentionOnly: boolean;
  searchQuery: string;
  sort: SortState;
  visibleApplicationColumns: string[];
}
