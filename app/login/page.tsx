import { LoginForm } from "@/components/LoginForm";
import { getDid } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const did = await getDid();
  if (did) redirect("/");

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="text-center">
          <div className="mx-auto mb-5 h-14 w-14 rounded-xl bg-scenius-600 flex items-center justify-center shadow-lg">
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <circle cx="6" cy="6" r="1.5" />
              <circle cx="18" cy="6" r="1.5" />
              <circle cx="6" cy="18" r="1.5" />
              <circle cx="18" cy="18" r="1.5" />
              <line x1="9.5" y1="9.5" x2="7" y2="7" />
              <line x1="14.5" y1="9.5" x2="17" y2="7" />
              <line x1="9.5" y1="14.5" x2="7" y2="17" />
              <line x1="14.5" y1="14.5" x2="17" y2="17" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-500">Sign in to scenius</h1>
          <p className="mt-2 text-sm text-text-secondary leading-relaxed">
            Use your Bluesky handle to sign in via AT Protocol.
            <br />
            <span className="text-text-tertiary">Your data stays on your PDS — we never own your identity.</span>
          </p>
        </div>
        <div className="mt-8 rounded-2xl border border-border bg-surface-raised p-6 shadow-sm animate-fade-up stagger-1">
          <LoginForm />
        </div>
        <p className="mt-5 text-center text-xs text-text-tertiary animate-fade-up stagger-2">
          Don&apos;t have a Bluesky account?{" "}
          <a
            href="https://bsky.app"
            className="font-medium text-scenius-600 hover:text-scenius-700 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            Create one &rarr;
          </a>
        </p>
      </div>
    </div>
  );
}
