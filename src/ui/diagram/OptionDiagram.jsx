// The option's sections as footprints on the ground, drawn isometric.
//
// A REAL 3D SCENE SEEN FROM A FIXED ANGLE, not an isometric projection. That is
// the whole reason for three.js here: the boxes will be joined by loaded meshes,
// which no 2D projection can draw, and turning on orbit later is mounting
// <OrbitControls /> with nothing about the geometry changing.
//
// LAZY-LOADED at its call site (ui/option/OptionCanvas.jsx). three.js is ~150 kB
// gzipped and a plain import would ship every byte of it to the Rhino Companion,
// which has no way to reach this view.
//
// Units and geometry are diagramLayout.js's — one world unit is one metre.

import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { DoubleSide, MOUSE, TOUCH } from 'three'
import { Edges, Line, OrbitControls, Text } from '@react-three/drei'
import { useCatalog } from '../../data/catalog.jsx'
import { summarize } from '../../data/optionData.js'
import { functionColours } from '../../data/functions.js'
import { formatArea } from '../map/area.js'
import { sectionBoxes, wallHeightFor } from './diagramLayout.js'

// THE VIEWING ANGLE, as the two numbers it actually is — turn about the vertical
// and height above the ground. Kept in degrees and named, because this is the
// thing most likely to be adjusted against a reference drawing, and a baked
// direction vector hides which of the two is wrong.
//
// 45 / 35.264 is TRUE ISOMETRIC: equal parts on all three axes, and the one
// elevation at which the ground lines project at exactly 30° on screen. Change
// ELEVATION_DEG and it becomes an axonometric that merely looks similar — the
// cube stops reading as a cube. Change PLAN_DEG and the two walls stop being
// equally foreshortened.
const PLAN_DEG = 45
const ELEVATION_DEG = 35.264

function cameraDirection() {
  const plan = (PLAN_DEG * Math.PI) / 180
  const elev = (ELEVATION_DEG * Math.PI) / 180
  const flat = Math.cos(elev)
  return [flat * Math.sin(plan), Math.sin(elev), flat * Math.cos(plan)]
}
const ISO = cameraDirection()

// The ink, at two weights. EVERY edge is drawn; the OUTLINE of the whole form is
// drawn heavier — the convention of a hand-drawn axonometric, and what stops a
// row of sections reading as one continuous folded surface.
const INK = '#1b1b1b'
const LINE = 1.2
const SILHOUETTE = 3.5

// WHICH WALLS ARE THE BACK ONES FOLLOWS FROM THE CAMERA, and is not a free
// choice. Looking from (+x, +y, +z), the two faces turned away are the ones at
// minimum x and minimum z, so those are where the walls stand — anywhere else
// and they would be in front of the floor, hiding what the drawing is of.
//
// Of those two, the one at minimum z spans X, and X is the axis that runs to the
// RIGHT of this screen (screen-right is x−z from here). So that is the right
// wall, and the section's name goes on it.
function SectionBox({ box, colours, name }) {
  const h = wallHeightFor(box)
  const halfW = box.width / 2
  const halfD = box.depth / 2

  // EVERY FILL IS PUSHED BACK A HAIR, and without it half the edges vanish. An
  // edge sits exactly in the plane of the two surfaces that meet there — the
  // wall bases are literally in the floor — so the depth test is a coin toss
  // per pixel and the fill wins about half of them: the outer profile survived
  // only because it had no surface behind it. polygonOffset moves the fill in
  // depth alone, so nothing shifts on screen and the line wins everywhere.
  //
  // Not `depthTest: false` on the lines: that would draw the edges on the far
  // side of the form straight through the near ones.
  const offset = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }

  const fill = (
    <meshBasicMaterial
      color={colours.background}
      side={DoubleSide}
      transparent={box.empty}
      opacity={box.empty ? 0.35 : 1}
      {...offset}
    />
  )

  return (
    <group position={[box.x, 0, 0]}>
      {/* The floor. A plane is born standing up in XY; this lays it down. On
          y = 0 rather than just above it — nothing is stacked here, so there is
          no z-fighting to dodge and an offset would be a height by the back
          door. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[box.width, box.depth]} />
        {/* Basic, not Lambert: an unlit material paints the function's colour
            exactly. A flat surface seen from one fixed angle has nothing for
            shading to describe, and shading it would report a hue the legend
            swatch beside it does not match. */}
        {fill}
        <Edges color={INK} lineWidth={LINE} />
      </mesh>

      {/* Left wall: at minimum x, spanning the depth. Turned a quarter turn
          about Y so its face looks along +x, into the room. */}
      <mesh position={[-halfW, h / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[box.depth, h]} />
        <meshBasicMaterial color={colours.inverted.background} side={DoubleSide} {...offset} />
        <Edges color={INK} lineWidth={LINE} />
      </mesh>

      {/* Right wall: at minimum z, spanning the width, facing the viewer. A
          plane's own face is +z, so this one needs no rotation at all — which is
          also why the name below sits square on it. */}
      <mesh position={[0, h / 2, -halfD]}>
        <planeGeometry args={[box.width, h]} />
        <meshBasicMaterial color={colours.inverted.background} side={DoubleSide} {...offset} />
        <Edges color={INK} lineWidth={LINE} />
      </mesh>

      {/* THE SILHOUETTE, WRITTEN OUT RATHER THAN DETECTED. A real outline pass
          means post-processing — a second render target and a depth/normal edge
          filter — for a shape whose outer profile is known in advance: the
          camera cannot rotate, so which edges are on the boundary never changes.
          Restore that reasoning before adding EffectComposer for this.
          It retraces edges the meshes above already drew thin, deliberately:
          overdrawing at a heavier weight is what makes a profile read as one
          continuous line rather than a chain of segments meeting at corners. */}
      <Line
        points={[
          [-halfW, h, halfD], // top of the left wall, near end
          [-halfW, h, -halfD], // the back corner, the highest point on screen
          [halfW, h, -halfD], // top of the right wall, far end
          [halfW, 0, -halfD], // down the right wall's open edge
          [halfW, 0, halfD], // around the floor, near corner
          [-halfW, 0, halfD],
          [-halfW, h, halfD], // and back up the left wall's open edge
        ]}
        color={INK}
        lineWidth={SILHOUETTE}
      />

      {/* THE NAME IS ON THE WALL, IN THE DRAWING — not a label pinned over it.
          A tag floating in screen space would keep its size as you zoomed and
          slide off the wall as you panned, which is what makes a diagram read as
          a chart with annotations rather than a picture of a thing.
          A hair in front of the wall, or it fights the surface for the same
          pixels. `maxWidth` wraps a long name rather than letting it run off the
          end of its own wall; `anchorY="top"` keeps a wrapped second line
          growing downward, so the first line stays where a one-line name was. */}
      <Text
        position={[-halfW + h * 0.18, h * 0.82, -halfD + 0.02]}
        anchorX="left"
        anchorY="top"
        fontSize={h * 0.3}
        maxWidth={box.width - h * 0.36}
        color={colours.inverted.color}
      >
        {name}
      </Text>
    </group>
  )
}

// Sets the zoom so the whole row fits, once per option and once per resize —
// never per frame, or it would fight the wheel and the view could not be zoomed
// at all. The row is metres across for one department and hundreds for a
// hospital, so a fixed zoom draws one of those two as a dot.
//
// √2 because the row is seen corner-on: a run `extent` long measures extent·√2
// across the screen from this angle.
function FrameToExtent({ extent }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  useEffect(() => {
    const span = Math.max(extent, 20) * Math.SQRT2 * 1.15
    camera.zoom = Math.min(size.width, size.height) / span
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height, extent])

  return null
}

export default function OptionDiagram({ departments, sectionIds, buildingFactors }) {
  const { sections, buildings, functions } = useCatalog()

  const { boxes, extent } = useMemo(() => {
    const { perDepartment } = summarize(departments, { sections, buildings, buildingFactors })
    return sectionBoxes({ sectionIds, sections, perDepartment })
  }, [departments, sectionIds, sections, buildings, buildingFactors])

  const reach = Math.max(extent, 20)
  const distance = reach * 4

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#f7f7f8' }}>
      {/* THE CAMERA IS THE CANVAS'S OWN, configured here — not a <OrthographicCamera
          makeDefault> inside it. drei's component promotes itself to default in a
          layout effect, so on the first commit `useThree(s => s.camera)` still
          hands a child the Canvas's built-in camera: <FrameToExtent> then set the
          zoom on an object nothing was rendering through, and the view opened at
          whatever the default was. Configured here there is only ever one camera.

          FRUSTUM LEFT TO THE VIEWPORT, FRAMING DONE BY ZOOM. Setting
          left/right/top/bottom by hand is the other trap: three.js does not
          correct an orthographic frustum for the canvas's aspect ratio, so a
          frustum shaped 4:3 on a 16:9 canvas scales x and y by different amounts
          — which shears the ground lines off 30° and makes a true isometric read
          as some other axonometric. Unset, R3F sizes it in pixels from the
          canvas and `zoom` is an honest world-to-pixel scale, equal on both axes.

          near is NEGATIVE on purpose: an ortho camera can see behind itself, and
          a half-space in front would clip the near corner of the row off. */}
      <Canvas
        orthographic
        dpr={[1, 2]}
        camera={{
          position: ISO.map((v) => v * distance),
          near: -distance * 4,
          far: distance * 4,
          zoom: 1,
        }}
      >
        <FrameToExtent extent={extent} />

        {/* ZOOM AND PAN, NEVER ROTATE. The angle is the drawing: an isometric
            nudged a few degrees off is an axonometric that merely looks like
            one, and there is no way back to true by hand. Rotation is the thing
            to turn on deliberately one day, not the thing to leave enabled.
            Panning is SCREEN-SPACE so a drag moves the surfaces with the
            pointer; the default pans along the camera's own ground plane, which
            from this angle sends them off diagonally. */}
        <OrbitControls
          makeDefault
          enableRotate={false}
          screenSpacePanning
          target={[0, 0, 0]}
          mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
          touches={{ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN }}
          minZoom={0.05}
          maxZoom={40}
        />

        {/* No lights: every material here is unlit. See SectionBox. */}

        <Suspense fallback={null}>
          {boxes.map((box) => (
            <SectionBox
              key={box.section.id}
              box={box}
              name={box.section.name}
              colours={functionColours(functions, box.section.function_id)}
            />
          ))}
        </Suspense>
      </Canvas>

      {/* The legend is HTML, not drawn in the scene: a label in 3D shrinks with
          the model and turns with the camera, and these are the reading the
          picture is for. */}
      {boxes.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            background: 'rgba(255,255,255,0.92)',
            border: '1px solid #ddd',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 12,
            maxHeight: '50%',
            overflowY: 'auto',
          }}
        >
          {boxes.map((box) => {
            const colours = functionColours(functions, box.section.function_id)
            return (
              <div key={box.section.id} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '3px 0' }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    background: colours.background,
                    border: `1px solid ${colours.border}`,
                    flex: '0 0 auto',
                  }}
                />
                <span>{box.section.name}</span>
                <span style={{ color: '#888', marginLeft: 'auto', paddingLeft: 12 }}>{formatArea(box.areaSqft)} sqft</span>
              </div>
            )
          })}
        </div>
      )}

      {boxes.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#999', fontSize: 13 }}>
          This option has no sections yet.
        </div>
      )}
    </div>
  )
}
