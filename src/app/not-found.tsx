import Link from "next/link";
import { SearchBar } from "@/components/SearchBar";

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <div className="font-mono text-6xl font-bold text-white">404</div>
      <h1 className="mt-3 text-2xl font-bold text-white">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        That page doesn&rsquo;t exist. Try searching for an employer, state, country, visa type, or job
        title.
      </p>
      <div className="mt-6 w-full max-w-md">
        <SearchBar />
      </div>
      <Link href="/" className="mt-6 text-sm font-semibold text-accent hover:text-accent-soft">
        ← Back to the dashboard
      </Link>
    </div>
  );
}
