import { Component } from 'react'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
  }

  public static getDerivedStateFromError() {
    return {
      hasError: true,
    }
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="boot-screen">
          <div className="boot-card">
            <p className="workspace-label">Desktop recovery</p>
            <h1>Universality hit an unexpected UI failure.</h1>
            <p className="workspace-copy">
              Reload the desktop shell to recover. Workspace persistence is designed
              to survive renderer crashes.
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
