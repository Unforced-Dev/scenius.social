import { getDid } from "@/lib/auth/session";
import { CreateSceneForm } from "@/components/CreateSceneForm";
import Link from "next/link";

export default async function NewScenePage() {
  const did = await getDid();

  if (!did) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6">
        <div className="w-full max-w-sm text-center animate-fade-up">
          <h1 className="font-display text-2xl font-500">Sign in to create a scene</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Scenes are written to your own PDS — you&apos;ll need to be signed in.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-xl bg-text px-6 py-2.5 text-sm font-semibold text-surface-raised hover:bg-text/90 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-12 sm:py-16">
      <div className="animate-fade-up">
        <Link
          href="/scenes"
          className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
        >
          ← Scenes
        </Link>
        <h1 className="mt-3 font-display text-3xl font-500">Create a scene</h1>
        <p className="mt-2 text-text-secondary">
          A scene is a community, neighborhood, or interest field. You&apos;ll curate
          its calendar and invite members.
        </p>
      </div>
      <div className="mt-8 rounded-2xl border border-border bg-surface-raised p-6 shadow-sm animate-fade-up stagger-1">
        <CreateSceneForm />
      </div>
    </div>
  );
}
