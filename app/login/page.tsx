import { LoginForm } from "@/components/LoginForm";
import { getDid } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const did = await getDid();
  if (did) redirect("/");

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Sign in to scenius</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Use your Bluesky handle to sign in via AT Protocol OAuth.
            Your data stays on your PDS — we never own your identity.
          </p>
        </div>
        <div className="mt-8 rounded-xl border border-border bg-surface-raised p-6">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-text-tertiary">
          Don&apos;t have a Bluesky account?{" "}
          <a
            href="https://bsky.app"
            className="text-scenius-600 hover:text-scenius-700"
            target="_blank"
            rel="noopener noreferrer"
          >
            Create one
          </a>
        </p>
      </div>
    </div>
  );
}
