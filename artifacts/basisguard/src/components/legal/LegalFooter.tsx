import { Link } from "wouter";

export function LegalFooter() {
  return (
    <footer className="border-t border-zinc-800 px-4 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
        <p>BasisGuard legal documents are drafts prepared for legal review.</p>
        <nav aria-label="Legal" className="flex gap-4">
          <Link href="/privacy" className="transition-colors hover:text-zinc-200">
            Privacy Policy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-zinc-200">
            Terms of Service
          </Link>
        </nav>
      </div>
    </footer>
  );
}