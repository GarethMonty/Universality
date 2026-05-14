import type { ComponentType, ReactNode, SVGProps } from 'react'
import { CloseIcon } from './icons'

export function DrawerHeader({
  title,
  subtitle,
  icon: Icon,
  onClose,
}: {
  title: string
  subtitle: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  onClose(): void
}) {
  return (
    <div className="drawer-header">
      <div className="drawer-title-row">
        <span className="drawer-title-icon">
          <Icon className="drawer-inline-icon" />
        </span>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      <button
        type="button"
        className="drawer-close"
        aria-label="Close drawer"
        title="Close this drawer and return to the workbench."
        onClick={onClose}
      >
        <CloseIcon className="drawer-inline-icon" />
      </button>
    </div>
  )
}

export function FormField({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <label className="drawer-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function DrawerDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
