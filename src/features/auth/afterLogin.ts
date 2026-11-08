const KEY = 'poker.afterLogin'

/** Remember where the user was heading (e.g. a /join/CODE link) across the OAuth round-trip. */
export function saveAfterLogin(path: string): void {
  try {
    if (path !== '/' && path !== '/login') sessionStorage.setItem(KEY, path)
  } catch {
    /* storage unavailable: the user just lands on the home page */
  }
}

export function takeAfterLogin(): string | null {
  try {
    const path = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return path !== null && path.startsWith('/') ? path : null
  } catch {
    return null
  }
}
