// ─── Shared types (moved out of products.ts to break the dependency) ──────────
export interface ProductTier {
  qty:   string;   // display label, e.g. "1–9 box"
  price: string;   // display price, e.g. "120.00"
}

export interface ProductCardProps {
  sku:         string;
  name:        string;
  category:    string;
  description: string | null;
  tiers:       ProductTier[];
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ProductCard({ sku, name, category, description, tiers }: ProductCardProps) {
  const accentColor =
    category === 'bubble_wrap'  ? 'bg-cyan-500'  :
    category === 'stretch_film' ? 'bg-blue-600'  :
    category === 'courier_bag'  ? 'bg-emerald-500' :
    'bg-slate-600';

  const categoryLabel =
    category === 'bubble_wrap'  ? 'Bubble Wrap'  :
    category === 'stretch_film' ? 'Stretch Film' :
    category === 'courier_bag'  ? 'Courier Bag'  :
    category;

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100 hover:shadow-2xl transition-shadow duration-300 flex flex-col h-full">
      <div className={`h-3 w-full ${accentColor}`} />
      <div className="p-6 flex-grow flex flex-col">
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 mb-2">
              {categoryLabel}
            </span>
            <h3 className="text-xl font-bold text-slate-800 leading-tight">{name}</h3>
            <p className="text-sm text-slate-400 mt-1">SKU: {sku}</p>
          </div>
        </div>

        {description && (
          <p className="text-slate-600 mb-6 flex-grow">{description}</p>
        )}

        {/* Pricing Tiers */}
        <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            阶梯报价 / Pricing Tiers
          </h4>
          <div className="space-y-2">
            {tiers.map((tier, index) => (
              <div
                key={index}
                className="flex justify-between items-center text-sm border-b border-slate-200 last:border-0 pb-2 last:pb-0"
              >
                <span className="font-medium text-slate-700">{tier.qty}</span>
                <span className="font-bold text-slate-900">RM {tier.price}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto">
          <a
            href={`https://wa.me/60129940514?text=Hi, I would like to order ${name} (${sku}).`}
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
