export default function PrivacyPolicy() {
    return (
        <div className="container mx-auto px-4 py-16 max-w-3xl">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
            <p className="text-slate-500 mb-8">Last Updated: {new Date().toLocaleDateString()}</p>

            <div className="prose prose-slate max-w-none">
                <p className="mb-4">
                    At Pek Laju Trading ("we", "us", "our"), we are committed to protecting your privacy in accordance with the
                    <strong> Personal Data Protection Act 2010 (PDPA)</strong> of Malaysia. This Policy outlines how we collect, use, and protect your personal data.
                </p>

                <h2 className="text-xl font-bold text-slate-800 mt-6 mb-3">1. Collection of Personal Data</h2>
                <p className="mb-4">
                    We may collect personal data such as your name, phone number, and address when you:
                </p>
                <ul className="list-disc pl-5 mb-4 space-y-1">
                    <li>Contact us via WhatsApp for inquiries or orders.</li>
                    <li>Communicate with us regarding our products and services.</li>
                </ul>

                <h2 className="text-xl font-bold text-slate-800 mt-6 mb-3">2. Purpose of Processing</h2>
                <p className="mb-4">
                    Your personal data is used solely for:
                </p>
                <ul className="list-disc pl-5 mb-4 space-y-1">
                    <li>Processing your orders and delivering products.</li>
                    <li>Responding to your inquiries.</li>
                    <li>Internal record keeping.</li>
                </ul>

                <h2 className="text-xl font-bold text-slate-800 mt-6 mb-3">3. Disclosure to Third Parties</h2>
                <p className="mb-4">
                    We do not sell or trade your data. We may only disclose your data to:
                </p>
                <ul className="list-disc pl-5 mb-4 space-y-1">
                    <li>Logistics partners for delivery purposes.</li>
                    <li>Regulatory authorities if required by law.</li>
                </ul>

                <h2 className="text-xl font-bold text-slate-800 mt-6 mb-3">4. Security</h2>
                <p className="mb-4">
                    We implement reasonable security measures to protect your data from unauthorized access or disclosure.
                </p>

                <h2 className="text-xl font-bold text-slate-800 mt-6 mb-3">5. Contact Us</h2>
                <p className="mb-4">
                    If you have any questions about this policy, please contact us at:
                </p>
                <div className="bg-slate-100 p-4 rounded-lg">
                    <p><strong>PEK LAJU TRADING</strong></p>
                    <p>012-994 0514</p>
                    <p>30, LRG JAYA 10, TMN AOR JAYA, 34000 TAIPING, PERAK</p>
                </div>
            </div>
        </div>
    );
}
