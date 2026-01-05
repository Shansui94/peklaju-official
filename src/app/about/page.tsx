export default function About() {
    return (
        <div className="container mx-auto px-4 py-16 max-w-4xl">
            <h1 className="text-4xl font-bold text-slate-900 mb-8">About Us</h1>

            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200">
                <p className="text-lg text-slate-700 mb-6 leading-relaxed">
                    Welcome to <span className="font-bold text-slate-900">PEK LAJU TRADING</span>.
                    We are a premier distributor of industrial packaging solutions based in Taiping, Perak.
                    Specializing in high-quality Bubble Wrap and Stretch Film, we serve e-commerce sellers, logistics companies, and manufacturers.
                </p>

                <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Company Details</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-slate-50 p-6 rounded-xl">
                    <div>
                        <h3 className="text-sm font-bold text-slate-500 uppercase mb-1">Company Name</h3>
                        <p className="font-semibold">PEK LAJU TRADING</p>
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-500 uppercase mb-1">Registration No. (SSM)</h3>
                        <p className="font-semibold">202503138032 (PG0571705-H)</p>
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-500 uppercase mb-1">Address</h3>
                        <p className="font-semibold">
                            30, LRG JAYA 10, TMN AOR JAYA,<br />
                            34000 TAIPING, PERAK
                        </p>
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-500 uppercase mb-1">Contact</h3>
                        <p className="font-semibold text-green-600">012-994 0514</p>
                    </div>
                </div>

                <div className="mt-12 text-center">
                    <p className="mb-6 text-slate-600">Ready to partner with us?</p>
                    <a
                        href="https://wa.me/60129940514"
                        target="_blank"
                        className="inline-block bg-cyan-600 text-white px-8 py-3 rounded-full font-bold hover:bg-cyan-700 transition-colors"
                    >
                        Contact via WhatsApp
                    </a>
                </div>
            </div>
        </div>
    );
}
