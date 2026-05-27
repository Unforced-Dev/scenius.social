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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="handle"
          className="block text-sm font-medium text-text-secondary"
        >
          Your Bluesky handle
        </label>
        <input
          id="handle"
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="you.bsky.social"
          className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-text-tertiary focus:border-scenius-400 focus:outline-none focus:ring-2 focus:ring-scenius-100"
          required
        />
      </div>
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading || !handle.trim()}
        className="w-full rounded-lg bg-scenius-600 py-2 text-sm font-semibold text-white hover:bg-scenius-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Connecting..." : "Sign in with AT Protocol"}
      </button>
    </form>
  );
}
