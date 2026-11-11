import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthProvider'
import { RequireAuth } from './features/auth/RequireAuth'
import { isSupabaseConfigured } from './lib/supabase'
import { BalancePage } from './pages/BalancePage'
import { GamePage } from './pages/GamePage'
import { HomePage } from './pages/HomePage'
import { JoinPage } from './pages/JoinPage'
import { LoginPage } from './pages/LoginPage'
import { SetupNotice } from './pages/SetupNotice'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false } },
})

export default function App() {
  if (!isSupabaseConfigured) return <SetupNotice />
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/balance" element={<BalancePage />} />
              <Route path="/g/:id" element={<GamePage />} />
              <Route path="/join/:code" element={<JoinPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
