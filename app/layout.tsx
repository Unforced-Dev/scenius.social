import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "scenius — community coordination",
  description: "Where scenes come alive. Events, people, and places — organized by community.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=Inter+Tight:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}

function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border/60 bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-baseline gap-2 group">
          <span className="text-brick text-xl leading-none">✶</span>
          <span className="text-xl font-display font-500 tracking-tight text-ink">
            scenius
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/events"
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-text-secondary hover:text-text hover:bg-surface-sunken transition-all"
          >
            Events
          </Link>
          <Link
            href="/scenes"
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-text-secondary hover:text-text hover:bg-surface-sunken transition-all"
          >
            Scenes
          </Link>
          <NavAuth />
        </div>
      </div>
    </nav>
  );
}

async function NavAuth() {
  const { getDid } = await import("@/lib/auth/session");
  const did = await getDid();

  if (did) {
    return (
      <>
        <Link
          href="/scenes/new"
          className="rounded-lg px-3.5 py-2 text-sm font-medium text-text-secondary hover:text-text hover:bg-surface-sunken transition-all"
        >
          Create scene
        </Link>
        <form action="/oauth/logout" method="POST">
          <button
            type="submit"
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-text-secondary hover:text-text hover:bg-surface-sunken transition-all"
          >
            Sign out
          </button>
        </form>
      </>
    );
  }

  return (
    <Link
      href="/login"
      className="ml-2 rounded-lg bg-text px-4 py-2 text-sm font-medium text-surface-raised hover:bg-text/90 transition-colors shadow-sm"
    >
      Sign in
    </Link>
  );
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-border/60 bg-surface-sunken/50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="font-display text-sm font-semibold text-text-secondary">scenius</span>
            <p className="mt-1 text-xs text-text-tertiary">
              Built on AT Protocol. Open source (AGPL-3.0).
            </p>
          </div>
          <div className="flex items-center gap-6 text-xs text-text-tertiary">
            <span>Boulder, CO</span>
            <a href="https://github.com/Unforced-Dev/scenius.social" target="_blank" rel="noopener noreferrer" className="hover:text-text-secondary transition-colors">
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
