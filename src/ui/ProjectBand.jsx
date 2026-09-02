// The band across the top of main on UHDP and Canvas: which project, and which
// of its options.
//
// They used to sit as two stacked cards at the top of side, above the option's
// own detail — so the thing you were editing started halfway down the column,
// and picking a different option meant looking away from the canvas it draws.
// Up here they read as what they are: the two choices that decide what main is
// showing. Side is left to whatever those choices select.
//
// Same band chrome as the Tree tab's carousels — see primitives/Band.jsx.

import { Band, BandRow } from './primitives/Band.jsx'
import ProjectPicker from './map/ProjectPicker.jsx'
import OptionList from './option/OptionList.jsx'

export default function ProjectBand({
  canCreate,
  selectedProjectId,
  onSelectProject,
  onProjectCreated,
  isDrawingSite,
  onStartDrawSite,
  onStopDrawSite,
  drawnSiteGeometry,
  optionsRefreshKey,
  selectedOptionId,
  onSelectOption,
}) {
  return (
    <Band edge="bottom">
      <BandRow title="Project">
        <ProjectPicker
          canCreate={canCreate}
          selectedProjectId={selectedProjectId}
          onSelectProject={onSelectProject}
          onProjectCreated={onProjectCreated}
          isDrawingSite={isDrawingSite}
          onStartDrawSite={onStartDrawSite}
          onStopDrawSite={onStopDrawSite}
          drawnSiteGeometry={drawnSiteGeometry}
        />
      </BandRow>

      {/* OptionList renders nothing without a project, which would leave an
          empty labelled row sitting there saying nothing. */}
      <BandRow title="Options" last>
        {selectedProjectId ? (
          <OptionList
            projectId={selectedProjectId}
            refreshKey={optionsRefreshKey}
            selectedOptionId={selectedOptionId}
            onSelectOption={onSelectOption}
          />
        ) : (
          <span style={{ fontSize: 12, color: '#bbb' }}>Pick a project first</span>
        )}
      </BandRow>
    </Band>
  )
}
