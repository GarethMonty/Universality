export interface AppHealth {
  runtime: 'browser-preview' | 'tauri'
  adapterHost: 'scaffolded' | 'connected'
  secretStorage: 'planned' | 'ready'
  platform: string
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

const browserHealth: AppHealth = {
  runtime: 'browser-preview',
  adapterHost: 'scaffolded',
  secretStorage: 'planned',
  platform: 'web',
}

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function loadAppHealth(): Promise<AppHealth> {
  if (!isTauriRuntime()) {
    return browserHealth
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<AppHealth>('get_app_health')
  } catch {
    return browserHealth
  }
}
