import { useAuth } from '../features/auth/AuthProvider'

// Placeholder: the games list, "new game" and "join by code" arrive in step 5.
export function HomePage() {
  const { session, signOut } = useAuth()
  const name = (session?.user.user_metadata.full_name as string | undefined) ?? 'שחקן'
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-bold">שלום, {name}</h1>
      <button type="button" onClick={() => void signOut()} className="text-slate-400 underline">
        התנתקות
      </button>
    </main>
  )
}
