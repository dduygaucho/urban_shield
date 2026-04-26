import Link from "next/link";

/**
 * Landing / navigation (Person 4 — integration).
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-8 px-6 py-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">UrbanShield</h1>
        <p className="mt-2 text-slate-600">
          Report safety incidents and see what others have reported nearby on the map.
        </p>
      </div>
      <nav className="flex flex-col gap-3">
        <Link
          href="/map"
          className="rounded-lg bg-slate-900 px-4 py-3 text-center font-medium text-white hover:bg-slate-800"
        >
          Open map
        </Link>
        <Link
          href="/report"
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-center font-medium text-slate-900 hover:bg-slate-50"
        >
          Report an incident
        </Link>
      </nav>
      <p className="text-xs text-slate-500">
        Configure <code className="rounded bg-slate-200 px-1">NEXT_PUBLIC_API_BASE_URL</code> and{" "}
        <code className="rounded bg-slate-200 px-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
        <code className="rounded bg-slate-200 px-1">apps/web/.env.local</code> (see{" "}
        <code className="rounded bg-slate-200 px-1">.env.example</code>).
      </p>
    </main>
  );
}
