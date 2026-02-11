export default function About() {
    return (
        <div className="container mx-auto px-4 py-16 max-w-4xl">
            <h1 className="text-4xl font-bold text-white mb-8">About Us</h1>

            <div className="bg-slate-900 rounded-2xl p-8 shadow-sm border border-slate-800">
                <p className="text-lg text-slate-300 mb-6 leading-relaxed">
                    Welcome to <span className="font-bold text-white">PEK LAJU TRADING</span>.
                    We are a premier distributor of industrial packaging solutions based in Taiping, Perak.
                    Specializing in high-quality Bubble Wrap and Stretch Film, we serve e-commerce sellers, logistics companies, and manufacturers.
                </p>

                <h2 className="text-2xl font-bold text-white mt-8 mb-4">Company Details</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-slate-800/50 p-6 rounded-xl border border-slate-700">
                    <div>
                        <h3 className="text-sm font-bold text-slate-400 uppercase mb-1">Company Name</h3>
                        <p className="font-semibold text-slate-200">PEK LAJU TRADING</p>
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-400 uppercase mb-1">Registration No. (SSM)</h3>
                        <p className="font-semibold text-slate-200">202503138032 (PG0571705-H)</p>
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-400 uppercase mb-1">Address</h3>
                        <p className="font-semibold text-slate-200">
                            30, LRG JAYA 10, TMN AOR JAYA,<br />
                            34000 TAIPING, PERAK
                        </p>
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-400 uppercase mb-1">Contact</h3>
                        <p className="font-semibold text-green-400">012-994 0514</p>
                    </div>
                </div>

                <div className="mt-12 text-center">
                    <p className="mb-6 text-slate-400">Ready to partner with us?</p>
                    <a
                        href="https://wa.me/60129940514"
                        target="_blank"
                        className="inline-block bg-cyan-600 text-white px-8 py-3 rounded-full font-bold hover:bg-cyan-500 transition-colors shadow-lg shadow-cyan-900/20"
                    >
                        Contact via WhatsApp
                    </a>
                </div>
            </div>
        </div>
    );
}
