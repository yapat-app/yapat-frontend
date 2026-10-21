/**
 * Shared layout for the Datasets page modals: centred in the window, and when
 * the content is taller than the window only the modal body scrolls, so the
 * title and the Cancel / OK buttons stay in view and the page behind does not
 * have to be scrolled.
 */
export const SCROLL_MODAL_PROPS = {
  centered: true,
  styles: {
    header: { marginBottom: 20 },
    body: {
      maxHeight: "calc(100dvh - 11rem)",
      overflowY: "auto",
      overflowX: "hidden",
      paddingRight: 8,
    },
  },
} as const;
