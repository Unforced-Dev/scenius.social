import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "scenius",
  description: "Community coordination for scenes that matter.",
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
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  );
}

function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-surface-raised/80 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <a href="/" className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight text-scenius-700">
            scenius
          </span>
        </a>
        <div className="flex items-center gap-6">
          <a
            href="/scenes"
            className="text-sm font-medium text-text-secondary hover:text-text transition-colors"
          >
            Scenes
          </a>
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
          className="text-sm font-medium text-text-secondary hover:text-text transition-colors"
        >
          Sign out
        </button>
      </form>
    );
  }

  return (
    <a
      href="/login"
      className="rounded-full bg-scenius-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-scenius-700 transition-colors"
    >
      Sign in
    </a>
  );
}
