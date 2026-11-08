import { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { saveAfterLogin, takeAfterLogin } from './afterLogin'

/** Renders the nested routes only for a signed-in user; restores the intended page after login. */
export function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const here = location.pathname + location.search
  const signedIn = session !== null

  useEffect(() => {
    if (loading) return
    if (!signedIn) {
      saveAfterLogin(here)
      return
    }
    const next = takeAfterLogin()
    if (next !== null && next !== here) navigate(next, { replace: true })
  }, [loading, signedIn, here, navigate])

  if (loading) return <p className="p-6 text-center text-slate-400">טוען…</p>
  if (!signedIn) return <Navigate to="/login" replace />
  return <Outlet />
}
