// The app-wide stylesheet, injected once by App.
//
// Everything in this app is styled inline, which means a global rule cannot
// simply repaint a button on hover: the inline `background` wins over any
// stylesheet declaration that isn't `!important`. So the shared feedback is
// built from properties nothing sets inline — brightness, shadow and scale —
// and it therefore works on every button whatever colour it happens to be: the
// white ones, the red remove circle, the rainbow add ring, the blue ribbon.
//
// Components that need more than that (RemoveButton's darker red, the ribbon's
// tinted fill) keep their own class rules, which win on specificity. This is
// the floor, not a ceiling.
//
// Anything disabled is excluded throughout: a control that won't respond
// shouldn't answer the pointer as if it will.

export const APP_STYLE = `
  button:not(:disabled) {
    transition: filter 120ms ease, box-shadow 120ms ease, transform 100ms ease, border-color 120ms ease;
  }
  button:not(:disabled):hover {
    filter: brightness(0.96);
    box-shadow: 0 1px 5px rgba(0,0,0,0.18);
  }
  button:not(:disabled):active {
    transform: scale(0.97);
  }
  button:not(:disabled):focus-visible {
    outline: 2px solid #1a73e8;
    outline-offset: 2px;
  }
  button:disabled { cursor: default; }

  /* Choosing an option is the main act on two screens — the band's chips and
     the chooser's cards — so those get a border that answers as well, which
     the generic rule can't do without knowing the resting colour. */
  .spp-option:not(:disabled):hover {
    border-color: #1a73e8 !important;
  }

  /* The one spinner in the app: a ring with a gap, turning. Sized in em so it
     matches whatever text it sits beside. */
  @keyframes spp-spin { to { transform: rotate(360deg); } }
  .spp-spinner {
    display: inline-block;
    width: 0.9em;
    height: 0.9em;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spp-spin 700ms linear infinite;
    vertical-align: -0.1em;
  }
  @media (prefers-reduced-motion: reduce) {
    .spp-spinner { animation-duration: 2s; }
  }

  /* Text and dropdown fields: same focus treatment as the buttons, so tabbing
     through a form doesn't lose the caret. */
  input:focus-visible, select:focus-visible {
    outline: 2px solid #1a73e8;
    outline-offset: 1px;
  }
`
