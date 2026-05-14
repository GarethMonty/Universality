import type {
  ExecutionCapabilities,
  ExplorerInspectResponse,
} from '@datapadplusplus/shared-types'
import { ExplorerIcon } from './icons'
import { DrawerHeader } from './RightDrawer.primitives'

export function InspectionBlade({
  capabilities,
  inspection,
  onApplyTemplate,
  onClose,
}: {
  capabilities: ExecutionCapabilities
  inspection?: ExplorerInspectResponse
  onApplyTemplate(queryTemplate?: string): void
  onClose(): void
}) {
  return (
    <>
      <DrawerHeader
        title="Inspection"
        subtitle="Object"
        icon={ExplorerIcon}
        onClose={onClose}
      />

      <div className="drawer-scroll">
        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Inspection</strong>
            <button
              type="button"
              className="drawer-link-button"
              disabled={!inspection?.queryTemplate}
              onClick={() => onApplyTemplate(inspection?.queryTemplate)}
            >
              Apply template
            </button>
          </div>

          <p className="drawer-copy">
            {inspection?.summary ?? 'No object selected.'}
          </p>

          {inspection?.queryTemplate ? (
            <pre className="drawer-code">
              <code>{inspection.queryTemplate}</code>
            </pre>
          ) : null}

          {inspection?.payload ? (
            <pre className="drawer-code">
              <code>{JSON.stringify(inspection.payload, null, 2)}</code>
            </pre>
          ) : null}
        </div>

        <div className="drawer-section">
          <div className="drawer-section-header">
            <strong>Capabilities</strong>
            <span>adapter</span>
          </div>
          <div className="drawer-pill-row">
            <span className="drawer-pill">Metadata {capabilities.supportsLiveMetadata ? 'yes' : 'no'}</span>
            <span className="drawer-pill">Cancel {capabilities.canCancel ? 'yes' : 'no'}</span>
            <span className="drawer-pill">Explain {capabilities.canExplain ? 'yes' : 'no'}</span>
          </div>
        </div>
      </div>
    </>
  )
}
