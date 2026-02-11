import Link from 'next/link';

export default function Navbar() {
    return (
        <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <Link href="/" className="text-xl font-bold text-white tracking-tight">
                    PEK LAJU <span className="text-cyan-400">TRADING</span>
                </Link>

                <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
                    <Link href="/" className="hover:text-cyan-400 transition-colors">产品目录</Link>
                    <Link href="/about" className="hover:text-cyan-400 transition-colors">关于我们</Link>

                    <a
                        href="https://wa.me/60129940514"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-cyan-600 hover:bg-cyan-700 text-white px-5 py-2 rounded-full transition-colors flex items-center gap-2"
                    >
                        <span>WhatsApp 咨询</span>
                    </a>
                </div>
            </div>
        </nav>
    );
}
