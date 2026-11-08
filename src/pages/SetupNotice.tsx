export function SetupNotice() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 p-6">
      <h1 className="text-2xl font-bold">צריך להתחבר ל-Supabase</h1>
      <p className="text-slate-300">
        הגדירו את <code dir="ltr">VITE_SUPABASE_URL</code> ואת{' '}
        <code dir="ltr">VITE_SUPABASE_ANON_KEY</code> (ראו <code dir="ltr">.env.example</code>) והפעילו מחדש.
      </p>
    </main>
  )
}
