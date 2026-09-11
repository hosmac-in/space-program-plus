// THE RHINO COMPANION — the second app
// ====================================
//
// `gh/sp_connect.py` opens this in a WebView2 window beside the model. It shows
// ONE option and exists for one gesture: select objects in Rhino, click a room
// or a department here, and those objects are tagged as that. See CLAUDE.md.
//
// It is a second app rather than the editor with a flag, because the two have
// different jobs. The editor AUTHORS a program — add, size, override, save. This
// CHECKS A MODEL AGAINST one it treats as frozen. What they share is everything
// about how an option is drawn, through `useOptionWorkspace`, `OptionCanvas` and
// `OptionPanel`, so the two cannot come to show different things.
//
// >>> NOTHING HERE IS NAVIGABLE, and that is the point rather than a limitation.
// >>> No brand-home, no Tree or Questions tabs, no project band, no option
// >>> chooser, no map. `view` in the URL is ignored: the option workspace is the
// >>> only thing this app can render. The window is bound to a document, the
// >>> document is bound to an option (sp_option in its user text), and wandering
// >>> off to another one would silently tag objects against the wrong program.
//
// It also has no footer. There is no undo — it writes nothing — and `AppFooter`
// would throw anyway: it reads the tree editor's context unconditionally, and
// that provider is one of the two this app does not mount.

import { useEffect } from 'react'
import { useUrlState } from '../url.js'
import { ReadOnlyProvider } from '../readOnly.jsx'
import SessionGate from '../ui/SessionGate.jsx'
import { SHARED_STYLE } from '../ui/appStyles.js'
import { RULE, SIDE_WIDTH } from '../ui/layout.js'
import Hud from '../ui/Hud.jsx'
import { PanelNote } from '../ui/panel/panelParts.jsx'
import { useToast } from '../ui/primitives/Toast.jsx'
import { AnnotationsProvider } from '../ui/option/annotations.jsx'
import OptionCanvas from '../ui/option/OptionCanvas.jsx'
import OptionPanel from '../ui/option/OptionPanel.jsx'
import { useOptionWorkspace } from '../ui/option/useOptionWorkspace.js'
import { useRhinoBridge, useRhinoSignIn } from './bridge.js'
import { useRoomAnnotations } from './roomAnnotations.jsx'
import { LINK_BUTTON_STYLE } from './LinkButton.jsx'
import CompanionHeader from './CompanionHeader.jsx'

const TITLE = 'Rhino Plus Companion - Space Program'

export default function CompanionApp() {
  useEffect(() => {
    document.title = TITLE
  }, [])

  return <SessionGate authNote={<RhinoSignIn />}>{() => <SignedIn />}</SessionGate>
}

// WebView2 keeps its own browser profile, so this window opens signed out and
// would otherwise show a login form in a window meant to be clicked through in
// seconds. It asks the host instead, which has the credentials — see bridge.js.
//
// A component rather than a hook call at the top, because SessionGate mounts
// `authNote` ONLY while there is no session: "not signed in, not still loading"
// is then structural rather than two booleans that have to be got right.
//
// An error here means gh/.env is wrong, which is why it is said out loud rather
// than leaving a login form nobody is going to type into.
function RhinoSignIn() {
  const error = useRhinoSignIn(false, false)
  if (!error) return null
  return (
    <p style={{ position: 'fixed', bottom: 16, left: 0, right: 0, textAlign: 'center', color: 'red' }}>
      Rhino sign-in failed: {error}
    </p>
  )
}

function SignedIn() {
  const [{ optionId }] = useUrlState()
  const { link, lastResult, census } = useRhinoBridge()
  const annotations = useRoomAnnotations(census, link)
  const workspace = useOptionWorkspace()
  const pushToast = useToast()

  // Rhino answers every link with what it actually wrote — how many objects, or
  // why none. It is the only confirmation there is: the writing happens in
  // another process and nothing on this side can see the model.
  useEffect(() => {
    if (lastResult?.message) pushToast(lastResult.message, lastResult.ok ? 'success' : 'error')
  }, [lastResult, pushToast])

  return (
    // Unconditionally read-only, not derived from a role: it is what this app is
    // for. Even signed in as an admin it shows no ×, no + and nothing to type
    // into. See src/readOnly.jsx.
    <ReadOnlyProvider readOnly>
      <AnnotationsProvider value={annotations}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>
          <style>{SHARED_STYLE + LINK_BUTTON_STYLE}</style>

          <CompanionHeader optionName={workspace.builderState.optionName} />

          {/* The same two regions the editor has, minus its band and footer. */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <div style={{ flex: 1, minWidth: 0, height: '100%', borderRight: RULE, position: 'relative' }}>
              {optionId ? (
                <OptionCanvas workspace={workspace} onSelectDepartment={workspace.selectDepartment} />
              ) : (
                <PanelNote pad>
                  This document is not bound to an option. Run sp_option_bind in Rhino first.
                </PanelNote>
              )}
            </div>

            <div
              style={{
                width: SIDE_WIDTH,
                flexShrink: 0,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                background: '#fafafa',
              }}
            >
              <div style={{ flex: 7, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
                <div style={{ padding: 16, minWidth: 0 }}>
                  {optionId && (
                    <OptionPanel
                      workspace={workspace}
                      optionId={optionId}
                      onSelectDepartment={workspace.selectDepartment}
                    />
                  )}
                </div>
              </div>

              {/* No project name: that came from the map's list of projects,
                  which this app has no reason to fetch. The option's own totals
                  are what the window is measured against. */}
              <Hud
                optionName={workspace.builderState.optionName}
                departments={workspace.builderState.departments}
                buildingFactors={workspace.builderState.buildingFactors}
                phaseCount={workspace.builderState.phaseCount}
              />
            </div>
          </div>
        </div>
      </AnnotationsProvider>
    </ReadOnlyProvider>
  )
}
