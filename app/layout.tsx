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
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,500&family=Outfit:wght@300;400;500;600;700&display=swap"
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
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="h-8 w-8 rounded-lg bg-scenius-600 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
          <span className="text-lg font-semibold tracking-tight font-display">
            scenius
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/scenes"
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-text-secondary hover:text-text hover:bg-surface-sunken transition-all"
          >
            Scenes
          </Link>
          <LoginButton />
        </div>
      </div>
    </nav>
  );
}

async function LoginButton() {
  const { getDid } = await import("@/lib/auth/session");
  const did = await getDid();

  if (did) {
    return (
      <form action="/oauth/logout" method="POST">
        <button
          type="submit"
          className="rounded-lg px-3.5 py-2 text-sm font-medium text-text-secondary hover:text-text hover:bg-surface-sunken transition-all"
        >
          Sign out
        </button>
      </form>
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
