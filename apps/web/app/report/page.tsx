"use client";

/**
 * Reporting form (Person 3 — reporting UI).
 */
import { useState } from "react";
import Link from "next/link";
import { createIncident } from "@/lib/api";
import { INCIDENT_CATEGORIES, type IncidentCategory } from "@schemas/incident";

export default function ReportPage() {
  const [category, setCategory] = useState<IncidentCategory>("suspicious");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage(null);

    if (!navigator.geolocation) {
      setStatus("error");
      setMessage("Geolocation is not supported in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await createIncident({
            category,
            description: description.trim(),
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          setDescription("");
          setStatus("success");
          setMessage("Incident reported. Check the map to see it nearby.");
        } catch (err) {
          setStatus("error");
          setMessage(err instanceof Error ? err.message : "Failed to submit");
        }
      },
      () => {
        setStatus("error");
        setMessage("Could not read your location. Allow location access and try again.");
      },
      { enableHighAccuracy: true, timeout: 15_000 }
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900">
        ← Home
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Report an incident</h1>
      <p className="mt-2 text-sm text-slate-600">
        Your browser location is captured when you submit. No address is stored beyond coordinates.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Category</span>
          <select
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
            value={category}
            onChange={(e) => setCategory(e.target.value as IncidentCategory)}
            disabled={status === "loading"}
          >
            {INCIDENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Description</span>
          <textarea
            required
            minLength={1}
            rows={4}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
            placeholder="What happened?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={status === "loading"}
          />
        </label>

        <button
          type="submit"
          disabled={status === "loading" || !description.trim()}
          className="rounded-lg bg-slate-900 px-4 py-3 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {status === "loading" ? "Submitting…" : "Submit report"}
        </button>
      </form>

      {message && (
        <p
          className={`mt-4 text-sm ${status === "success" ? "text-green-700" : "text-red-700"}`}
          role="status"
        >
          {message}
        </p>
      )}

      <p className="mt-8 text-sm text-slate-500">
        After reporting, open the <Link href="/map" className="text-blue-600 underline">map</Link> and
        refresh if the marker does not appear immediately.
      </p>
    </main>
  );
}
