"use client";

/**
 * Reporting is map-first: use the ➕ Report button on `/map`.
 * This route redirects for bookmarks and old links.
 */
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ReportRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/map");
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Report on the map</h1>
      <p className="text-slate-600">
        Open the map and tap <span className="font-semibold">➕ Report</span> in the bottom-right corner. A bottom sheet
        will open so the map stays visible.
      </p>
      <Link
        href="/map"
        className="rounded-2xl bg-slate-900 px-4 py-3 text-center text-base font-semibold text-white shadow-lg hover:bg-slate-800"
      >
        Go to map
      </Link>
      <p className="text-xs text-slate-500">This page will try to redirect you automatically.</p>
    </main>
  );
}
