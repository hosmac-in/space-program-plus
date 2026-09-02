// Central z-index scale. Keep every stacked/floating element's z-index sourced
// from here so layering stays consistent as new UI gets added.
//
// Order (low -> high): a sticky in-panel header < in-map floating controls < an open
// dropdown list (above the panel content it covers, below anything modal) <
// modal/lightbox overlays < toast notifications (always on top of everything,
// even modals, since they're transient feedback) < the slow-connection loading
// overlay (above everything, including toasts, since it means the app may not
// be able to respond at all right now).
export const Z = {
  // Nothing claims this today — the app header is a real band in the layout
  // rather than an overlay — but a sticky bar inside a scrolling panel needs it.
  header: 10,
  mapControls: 500,
  dropdown: 600,
  modal: 1000,
  toast: 2000,
  loadingOverlay: 3000,
}
