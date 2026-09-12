// The 3D diagram's numbers and the one derivation that feeds it.
//
// ONE WORLD UNIT IS ONE METRE. Chosen once and not negotiable per component: the
// three.js ecosystem assumes it (default camera `near`, light falloff, every
// drei helper), and float32 stays comfortable across a whole site. Every area in
// this app is sqft, so the conversion happens HERE, at the boundary, and nothing
// downstream sees a square foot.
//
// The DISPLAY unit is a separate question and is not this module's — a figure
// shown to a person goes through `formatArea` (ui/map/area.js), which is the one
// place a metric toggle would ever land.
//
// The geometry is DERIVED on every render, never stored — the same rule
// `circulationSqft` follows, so the diagram cannot disagree with the HUD.

export const SQM_PER_SQFT = 0.09290304

// The footprint's proportions. A section has no shape, so the diagram states one
// rather than inventing a different one per box: every plan reads as the same
// kind of object and only its size carries meaning.
export const FOOTPRINT_RATIO = 3 / 4

// A SECTION IS A SURFACE, NOT A MASS — no height at all. Nothing in the
// documents says how tall a section is, and a placeholder height is a claim
// about the building rather than an absence of one. It stays a footprint until
// something real says otherwise (a floor count per section is the obvious
// source), and the scene stays 3D so that day costs nothing.
//
// Between surfaces, so two sections never read as one.
export const GAP_M = 6

// THE WALLS ARE A DRAWING DEVICE, NOT THE HEIGHT THE SECTION HASN'T GOT. Two of
// them, at the back corner, the way a dollhouse axonometric is drawn: they give
// the footprint a corner to sit in, so it reads as a room seen into rather than
// a coloured shape lying on nothing. The section's name goes on one of them.
//
// Proportional rather than a fixed storey, because a section is anything from a
// consulting suite to a whole hospital: 3.5 m of wall against a 120 m footprint
// is a hairline, and the picture would read differently at every size. Floored
// so a small section still gets a corner worth seeing.
export function wallHeightFor({ width, depth }) {
  return Math.max(3, Math.min(width, depth) * 0.18)
}

// A section with no departments in it yet. Options may hold an empty section
// deliberately (see optionData.js), so it is drawn as a marker rather than
// skipped — dropped from the row, the diagram would silently disagree with the
// canvas about what the option contains.
export const EMPTY_FOOTPRINT_M = 4

// w × d for an area, at the fixed ratio: w·d = area and w/d = 3/4.
export function footprintFor(areaSqm) {
  if (!(areaSqm > 0)) return { width: EMPTY_FOOTPRINT_M, depth: EMPTY_FOOTPRINT_M, empty: true }
  const depth = Math.sqrt(areaSqm / FOOTPRINT_RATIO)
  return { width: depth * FOOTPRINT_RATIO, depth, empty: false }
}

// The option's sections as boxes, laid in one row along X.
//
// A row rather than a grid: with the boxes sized by area and nothing yet saying
// where a section sits, any 2D packing is a claim about adjacency that the data
// does not make. A row claims only an order, which is the sections' own.
//
// Areas come from `summarize`'s perDepartment — the one definition of a
// department's area — bucketed to the section its catalog placement sits in.
// Sections the option does not include are not drawn even if their departments
// somehow are: `sectionIds` is what the option says it holds.
export function sectionBoxes({ sectionIds = [], sections = [], perDepartment = [] }) {
  // instance_id of a department placement -> the section holding it.
  const sectionOfDept = new Map()
  sections.forEach((section) => {
    ;(section.tree?.groups ?? []).forEach((group) => {
      ;(group.departments ?? []).forEach((dept) => {
        if (dept.instance_id) sectionOfDept.set(dept.instance_id, section.id)
      })
    })
  })

  const areaBySection = new Map()
  perDepartment.forEach((d) => {
    const sectionId = sectionOfDept.get(d.treeNodeId)
    if (!sectionId) return
    areaBySection.set(sectionId, (areaBySection.get(sectionId) ?? 0) + (d.areaSqft ?? 0))
  })

  const rows = sectionIds
    .map((id) => sections.find((s) => s.id === id) ?? null)
    .filter(Boolean)
    .map((section) => {
      const areaSqft = areaBySection.get(section.id) ?? 0
      return { section, areaSqft, ...footprintFor(areaSqft * SQM_PER_SQFT) }
    })

  // Laid out left to right, each box centred on its own footprint and the whole
  // row centred on the origin — so the camera can point at 0,0,0 whatever the
  // option holds.
  const total = rows.reduce((sum, r) => sum + r.width, 0) + GAP_M * Math.max(0, rows.length - 1)
  let x = -total / 2
  const boxes = rows.map((r) => {
    const centre = x + r.width / 2
    x += r.width + GAP_M
    return { ...r, x: centre }
  })

  // What the camera has to frame. Depth counts too: the boxes are not all the
  // same, so the deepest one is what sets the row's extent front to back.
  const extent = Math.max(total, ...boxes.map((b) => b.depth), EMPTY_FOOTPRINT_M)
  return { boxes, extent }
}
