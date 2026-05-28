/**
 * Calendar page's filter-bar uses the shared `CalendarFiltersBar` component
 * with the calendar-specific props it expects. Keeping the import path
 * stable as `./components/filter-bar` lets the page reference siblings
 * uniformly even though the implementation lives under `@/interface`.
 */
export { CalendarFiltersBar as FilterBar } from "@/interface/components/calendar-filters-bar";
