import { products } from "@/data/products";
import ProductCard from "@/components/ProductCard";

export default function Home() {
  return (
    <div className="pb-20">
      {/* Hero Section */}
      <section className="relative bg-slate-900 text-white py-24 md:py-32 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-900 opacity-90"></div>
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>

        <div className="container mx-auto relative z-10 text-center max-w-4xl">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6">
            PEK LAJU <span className="text-cyan-400">TRADING</span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-300 mb-10 font-light">
            Quality Packaging Solutions for Business. <br />
            <span className="font-medium text-white">Factory Direct Bubble Wrap & Stretch Film.</span>
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="#products"
              className="px-8 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-full transition-all shadow-lg shadow-cyan-500/30"
            >
              查看产品 / View Products
            </a>
            <a
              href="https://wa.me/60129940514"
              className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-full backdrop-blur-sm border border-white/30 transition-all"
            >
              联系客服 / Contact Us
            </a>
          </div>
        </div>
      </section>

      {/* Product Showcase */}
      <section id="products" className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-800 mb-4">Core Products</h2>
          <p className="text-slate-500 max-w-2xl mx-auto">
            High-grade materials suitable for e-commerce, logistics, and industrial use.
            Bulk pricing available.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {products.map((product) => (
            <ProductCard key={product.sku} product={product} />
          ))}
        </div>
      </section>

      {/* Trust Indicators */}
      <section className="bg-white py-16 border-y border-slate-100">
        <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div className="p-6">
            <div className="w-12 h-12 bg-cyan-100 text-cyan-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            </div>
            <h3 className="text-lg font-bold mb-2">Premium Quality</h3>
            <p className="text-slate-500 text-sm">Industrial grade materials ensuring maximum protection.</p>
          </div>
          <div className="p-6">
            <div className="w-12 h-12 bg-cyan-100 text-cyan-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </div>
            <h3 className="text-lg font-bold mb-2">Factory Direct</h3>
            <p className="text-slate-500 text-sm">Best prices in the market, tiered for your volume.</p>
          </div>
          <div className="p-6">
            <div className="w-12 h-12 bg-cyan-100 text-cyan-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
            </div>
            <h3 className="text-lg font-bold mb-2">Fast Delivery</h3>
            <p className="text-slate-500 text-sm">Quick turnaround for local businesses in Perak & beyond.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
