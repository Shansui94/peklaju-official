import Link from 'next/link';

export default function Footer() {
    return (
        <footer className="bg-slate-900 text-white py-12 border-t border-slate-800">
            <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm md:text-base">
                {/* Company Info */}
                <div>
                    <h3 className="text-xl font-bold mb-4 text-cyan-400">PEK LAJU TRADING</h3>
                    <p className="text-slate-400 mb-2">SSM: 202503138032 (PG0571705-H)</p>
                    <address className="not-italic text-slate-300 space-y-2">
                        <p>30, LRG JAYA 10, TMN AOR JAYA,</p>
                        <p>34000 TAIPING, PERAK</p>
                    </address>
                </div>

                {/* Quick Links */}
                <div>
                    <h4 className="text-lg font-semibold mb-4 text-slate-200">快速链接</h4>
                    <ul className="space-y-2">
                        <li><Link href="/" className="hover:text-cyan-400 transition-colors">首页</Link></li>
                        <li><Link href="/about" className="hover:text-cyan-400 transition-colors">关于我们</Link></li>
                        <li><Link href="/privacy-policy" className="hover:text-cyan-400 transition-colors">隐私政策 (PDPA)</Link></li>
                    </ul>
                </div>

                {/* Contact */}
                <div>
                    <h4 className="text-lg font-semibold mb-4 text-slate-200">联系我们</h4>
                    <div className="space-y-3">
                        <a
                            href="https://wa.me/60129940514"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-green-400 hover:text-green-300 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                            012-994 0514
                        </a>
                        <p className="text-slate-500 text-xs mt-4">
                            © {new Date().getFullYear()} Pek Laju Trading. All rights reserved.
                        </p>
                    </div>
                </div>
            </div>
        </footer>
    );
}
