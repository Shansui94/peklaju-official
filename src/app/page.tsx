export const dynamic = 'force-dynamic'; // 不在 build 时预渲染，避免 Supabase 不可用时崩溃

import { createClient } from '@supabase/supabase-js';
import ProductCard, { ProductCardProps } from '@/components/ProductCard';

// ─── Types ────────────────────────────────────────────────────────────────────
interface DbPriceTier {
  product_id: number;
  min_qty:    number;
  max_qty:    number | null;
  unit_price: number;
}

interface DbProduct {
  id:          number;
  sku:         string;
  name:        string;
  category:    string;
  description: string | null;
  unit:        string;
}

// ─── Supabase (service role — Server Component only, never reaches client) ───
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Format tier range label ──────────────────────────────────────────────────
function fmtQty(min: number, max: number | null, unit: string): string {
  if (max === null) return `≥${min} ${unit}`;
  if (min === max)  return `${min} ${unit}`;
  return `${min}–${max} ${unit}`;
}

// ─── Fetch products + tiers from DB ──────────────────────────────────────────
async function fetchProducts(): Promise<ProductCardProps[]> {
  try {
    const sb = getSupabase();
    if (!sb) return [];

    const [prodRes, tierRes] = await Promise.all([
      sb.from('products')
        .select('id,sku,name,category,description,unit')
        .eq('is_active', true)
        .order('id'),
      sb.from('price_tiers')
        .select('product_id,min_qty,max_qty,unit_price')
        .order('product_id')
        .order('min_qty'),
    ]);

    if (prodRes.error) console.error('[Page] products error:', prodRes.error.message);
    if (tierRes.error) console.error('[Page] tiers error:', tierRes.error.message);

    const products = (prodRes.data ?? []) as DbProduct[];
    const tiers    = (tierRes.data ?? []) as DbPriceTier[];

    if (!products.length) return [];

    // Group tiers by product_id
    const tierMap = new Map<number, DbPriceTier[]>();
    for (const t of tiers) {
      if (!tierMap.has(t.product_id)) tierMap.set(t.product_id, []);
      tierMap.get(t.product_id)!.push(t);
    }

    return products.map((p) => ({
      sku:         p.sku,
      name:        p.name,
      category:    p.category,
      description: p.description,
      tiers: (tierMap.get(p.id) ?? []).map((t) => ({
        qty:   fmtQty(t.min_qty, t.max_qty, p.unit),
        price: Number(t.unit_price).toFixed(2),
      })),
    }));
  } catch (err) {
    console.error('[Page] fetchProducts crashed:', err);
    return [];
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function Home() {
  const productCards = await fetchProducts();

  return (
    <div className="pb-20">
      {/* Hero */}
      <section className="relative bg-slate-900 text-white py-24 md:py-32 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-900 opacity-90" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        <div className="container mx-auto relative z-10 text-center max-w-4xl">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6">
            PEK LAJU <span className="text-cyan-400">TRADING</span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-300 mb-10 font-light">
            Quality Packaging Solutions for Business. <br />
            <span className="font-medium text-white">Factory Direct Bubble Wrap &amp; Stretch Film.</span>
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="#products" className="px-8 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-full transition-all shadow-lg shadow-cyan-500/30">
              查看产品 / View Products
            </a>
            <a href="https://wa.me/60129940514" className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-full backdrop-blur-sm border border-white/30 transition-all">
              联系客服 / Contact Us
            </a>
          </div>
        </div>
      </section>

      {/* Products */}
      <section id="products" className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-800 mb-4">Core Products</h2>
          <p className="text-slate-500 max-w-2xl mx-auto">
            High-grade materials suitable for e-commerce, logistics, and industrial use. Bulk pricing available.
          </p>
        </div>
        {productCards.length === 0 ? (
          <p className="text-center text-slate-400 py-12">Loading product catalogue… please check back shortly.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {productCards.map((p) => <ProductCard key={p.sku} {...p} />)}
          </div>
        )}
      </section>

      {/* Trust */}
      <section className="bg-white py-16 border-y border-slate-100">
        <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          {[
            { icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>, title: 'Premium Quality', desc: 'Industrial grade materials ensuring maximum protection.' },
            { icon: <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>, title: 'Factory Direct', desc: 'Best prices in the market, tiered for your volume.' },
            { icon: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>, title: 'Fast Delivery', desc: 'Quick turnaround for local businesses in Perak & beyond.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="p-6">
              <div className="w-12 h-12 bg-cyan-100 text-cyan-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
              </div>
              <h3 className="text-lg font-bold mb-2">{title}</h3>
              <p className="text-slate-500 text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
