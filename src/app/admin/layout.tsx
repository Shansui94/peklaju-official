import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin — Pek Laju Order Management',
  robots: 'noindex, nofollow',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Admin Top Bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center font-black text-slate-900 text-sm">
            PL
          </div>
          <span className="font-bold text-slate-100 tracking-tight">
            Pek Laju <span className="text-cyan-400">Admin</span>
          </span>
        </div>
        <span className="text-xs text-slate-500">Boss-only portal · Not for public</span>
      </header>

      <main className="p-6 max-w-7xl mx-auto">{children}</main>
    </div>
  );
}
