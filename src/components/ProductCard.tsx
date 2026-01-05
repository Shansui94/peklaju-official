import { Product } from "@/data/products";

export default function ProductCard({ product }: { product: Product }) {
    return (
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100 hover:shadow-2xl transition-shadow duration-300 flex flex-col h-full">
            <div className={`h-3 w-full ${product.category === 'Bubble Wrap' ? 'bg-cyan-500' : 'bg-blue-600'}`}></div>
            <div className="p-6 flex-grow flex flex-col">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 mb-2">
                            {product.category}
                        </span>
                        <h3 className="text-xl font-bold text-slate-800 leading-tight">{product.name}</h3>
                        <p className="text-sm text-slate-400 mt-1">SKU: {product.sku}</p>
                    </div>
                </div>

                <p className="text-slate-600 mb-6 flex-grow">{product.description}</p>

                {/* Pricing Tiers */}
                <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">阶梯报价 / Pricing Tiers</h4>
                    <div className="space-y-2">
                        {product.tiers.map((tier, index) => (
                            <div key={index} className="flex justify-between items-center text-sm border-b border-slate-200 last:border-0 pb-2 last:pb-0">
                                <span className="font-medium text-slate-700">{tier.qty}</span>
                                <span className="font-bold text-slate-900">RM {tier.price}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-auto">
                    <a
                        href={`https://wa.me/60129940514?text=Hi, I would like to order ${product.name} (${product.sku}).`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full text-center bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-lg shadow-green-200"
                    >
                        立即订购 (WhatsApp)
                    </a>
                </div>
            </div>
        </div>
    );
}
