"use client";

import { useState } from "react";

export function LoginForm() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/oauth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: handle.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      window.location.href = data.redirectUrl;
    } catch {
      setError("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label
          htmlFor="handle"
          className="block text-sm font-medium text-text mb-2"
        >
          Your Bluesky handle
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary text-sm select-none">@</span>
          <input
            id="handle"
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="you.bsky.social"
            className="w-full rounded-xl border border-border bg-surface pl-8 pr-4 py-2.5 text-sm placeholder:text-text-tertiary focus:border-scenius-400 focus:outline-none focus:ring-2 focus:ring-scenius-100 transition-all"
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck="false"
          />
        </div>
      </div>
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200/60 px-3 py-2">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      <button
        type="submit"
        disabled={loading || !handle.trim()}
        className="w-full rounded-xl bg-text py-2.5 text-sm font-semibold text-surface-raised hover:bg-text/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Connecting...
          </span>
        ) : (
          "Continue"
        )}
      </button>
    </form>
  );
}
