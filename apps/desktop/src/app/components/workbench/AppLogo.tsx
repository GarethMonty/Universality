interface AppLogoProps {
  className?: string
  kind?: 'full' | 'mark' | 'transparent'
}

export function AppLogo({ className, kind = 'full' }: AppLogoProps) {
  const classes = `app-logo app-logo--${kind}${className ? ` ${className}` : ''}`

  if (kind === 'mark') {
    return (
      <img
        className={classes}
        src="/icon.png"
        alt="DataPad++"
        loading="eager"
        decoding="async"
      />
    )
  }

  if (kind === 'transparent') {
    return (
      <img
        className={classes}
        src="/logo_transparent.png"
        alt="DataPad++"
        loading="eager"
        decoding="async"
      />
    )
  }

  return (
    <span className={classes} aria-label="DataPad++">
      <img
        className="app-logo-image app-logo-image--light"
        src="/logo.png"
        alt=""
        aria-hidden="true"
        loading="eager"
        decoding="async"
      />
      <img
        className="app-logo-image app-logo-image--dark"
        src="/logo_dark.png"
        alt=""
        aria-hidden="true"
        loading="eager"
        decoding="async"
      />
    </span>
  )
}
