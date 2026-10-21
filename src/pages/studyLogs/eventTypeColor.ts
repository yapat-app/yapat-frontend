/**
 * Maps study event types to AntD Tag colour strings.
 * Groups events by functional category.
 */

const EVENT_TYPE_COLORS: Record<string, string> = {
  // Lifecycle
  session_start: "blue",
  session_end: "blue",
  phase_change: "blue",
  log_dropped: "default",

  // Panel / layout
  panel_enter: "purple",
  panel_exit: "purple",
  split_resize: "purple",

  // Feed
  feed_active_snippet_change: "green",
  feed_sort_change: "green",

  // Annotation
  feedback_submit: "orange",
  label_toggle: "orange",
  label_clear: "orange",

  // Hub filters / navigation
  dataset_change: "geekblue",
  annotation_status_filter_change: "geekblue",
  annotated_species_filter_change: "geekblue",
  focus_species_change: "geekblue",
  find_similar_start: "geekblue",
  find_similar_clear: "geekblue",
  label_scope_change: "geekblue",
  location_filter_change: "geekblue",
  month_filter_change: "geekblue",
  label_search: "orange",

  // Study flow
  phase_instructions_shown: "blue",
  phase_tour_start: "blue",
  phase_tour_complete: "blue",

  // Visualisation
  projection_view_change: "cyan",
  projection_drag_mode_change: "cyan",
  vis_point_click: "cyan",
  vis_point_hover: "cyan",
  projection_method_change: "cyan",
  sampling_method_change: "cyan",
  visibility_threshold_change: "cyan",
  visibility_range_change: "cyan",
  date_time_filter_change: "cyan",
  color_property_change: "cyan",
  histogram_property_select: "cyan",
  histogram_multi_toggle: "cyan",

  // Retrain
  retrain_manual_click: "red",
  retrain_complete: "red",

  // Audio
  audio_interaction: "gold",
};

export function eventTypeColor(eventType: string): string {
  return EVENT_TYPE_COLORS[eventType] ?? "default";
}
