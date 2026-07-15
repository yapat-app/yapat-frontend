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

  // Visualisation
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
  audio_play_segment: "gold",
  audio_volume_change: "gold",
  audio_seek: "gold",
};

export function eventTypeColor(eventType: string): string {
  return EVENT_TYPE_COLORS[eventType] ?? "default";
}
