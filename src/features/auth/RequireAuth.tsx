import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'

/** Renders the nested routes only for a signed-in user. */
export function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) return <p className="p-6 text-center text-slate-400">טוען…</p>
  if (session === null) return <Navigate to="/login" replace />
  return <Outlet />
}
