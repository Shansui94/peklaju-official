export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { generateInvoicePDF } from '@/lib/generate-invoice';
import { uploadAndSendInvoice } from '@/lib/whatsapp-media';

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrderItem {
  product:    string;
  qty:        number;
  unit_price: number;
  subtotal:   number;
}

interface Order {
  id:          number;
  customer_id: string;          // wa_id e.g. "60123456789"
  items:       OrderItem[];
  total_price: number;
  status:      string;
  notes:       string | null;
  created_at:  string;
}

// ─── Supabase (service role — server only) ────────────────────────────────────
function getAdminSb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { 
    auth: { persistSession: false },
    global: { fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }) }
  });
}

// ─── Server Actions ───────────────────────────────────────────────────────────

/** 确认订单：生成发票 PDF → 发给客户 WhatsApp → 更新状态 'confirmed' */
async function confirmOrder(formData: FormData) {
  'use server';
  const orderId = formData.get('orderId') as string;
  const sb = getAdminSb();
  if (!sb) { console.error('[Admin] Supabase not configured'); return; }

  // 1. 取完整订单数据
  const { data: order, error: fetchErr } = await sb
    .from('orders')
    .select('id, customer_id, items, total_price, notes, created_at')
    .eq('id', orderId)
    .single();

  if (fetchErr || !order) {
    console.error('[Admin] 无法取得订单:', fetchErr?.message);
  } else {
    try {
      // 2. 生成 PDF
      const invoiceNo  = `INV-${String(order.id).padStart(5, '0')}`;
      const pdfBuffer  = await generateInvoicePDF(order);

      // 3. 上传 + 发送给客户 WhatsApp
      await uploadAndSendInvoice(pdfBuffer, order.customer_id, invoiceNo);
    } catch (err) {
      // 发票失败不阻断确认流程
      console.error('[Admin] 发票生成/发送失败:', err);
    }
  }

  // 4. 更新订单状态
  const { error } = await sb
    .from('orders')
    .update({ status: 'confirmed' })
    .eq('id', orderId);

  if (error) console.error('[Admin] 更新状态失败:', error.message);

  revalidatePath('/admin/orders');
}


/** 拒绝订单：status → 'cancelled' */
async function rejectOrder(formData: FormData) {
  'use server';
  const orderId = formData.get('orderId') as string;
  const sb = getAdminSb();
  if (!sb) { console.error('[Admin] Supabase not configured'); return; }
  await sb.from('orders').update({ status: 'cancelled' }).eq('id', orderId);
  revalidatePath('/admin/orders');
}

// ─── Data Fetch ───────────────────────────────────────────────────────────────
async function fetchPendingOrders(): Promise<Order[]> {
  try {
    const sb = getAdminSb();
    if (!sb) return [];

    const { data, error } = await sb
      .from('orders')
      .select('id, customer_id, items, total_price, status, notes, created_at')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Admin] fetchPendingOrders failed:', error.message);
      return [];
    }
    return (data ?? []) as Order[];
  } catch (err) {
    console.error('[Admin] fetchPendingOrders crashed:', err);
    return [];
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatWaId(waId: string) {
  // "60123456789" → "+60 12-345 6789" (approximate)
  return `+${waId.slice(0, 2)} ${waId.slice(2, 4)}-${waId.slice(4, 7)} ${waId.slice(7)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    year:  'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function OrdersPage() {
  const orders = await fetchPendingOrders();

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            📋 待审批订单
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Pending Approval — {orders.length} order{orders.length !== 1 ? 's' : ''}
          </p>
        </div>
        <a
          href="/admin/orders"
          className="text-xs text-cyan-400 hover:text-cyan-300 border border-slate-700 hover:border-cyan-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          ⟳ Refresh
        </a>
      </div>

      {/* Empty State */}
      {orders.length === 0 && (
        <div className="text-center py-24 text-slate-500">
          <div className="text-5xl mb-4">✅</div>
          <p className="text-lg font-medium">All clear, Boss.</p>
          <p className="text-sm mt-1">No pending orders right now.</p>
        </div>
      )}

      {/* Order Cards */}
      <div className="space-y-4">
        {orders.map((order) => (
          <div
            key={order.id}
            className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700 transition-colors"
          >
            {/* Card Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
              <div className="flex items-center gap-4">
                <span className="font-mono text-xs text-slate-400">#{order.id}</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Pending Approval
                </span>
              </div>
              <span className="text-xs text-slate-500">{formatDate(order.created_at)}</span>
            </div>

            {/* Card Body */}
            <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Col 1: Customer */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Customer
                </p>
                <a
                  href={`https://wa.me/${order.customer_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 font-mono text-sm flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.554 4.122 1.523 5.855L.057 23.636a.5.5 0 00.6.6l5.78-1.466A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.722 9.722 0 01-5.012-1.384l-.36-.214-3.728.945.963-3.728-.234-.374A9.72 9.72 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
                  </svg>
                  {formatWaId(order.customer_id)}
                </a>
                {order.notes && (
                  <div className="mt-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Delivery Notes
                    </p>
                    <p className="text-sm text-slate-300 bg-slate-800 rounded-lg px-3 py-2">
                      {order.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Col 2: Items */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Order Items
                </p>
                <div className="space-y-2">
                  {(order.items ?? []).map((item, i) => (
                    <div key={i} className="flex justify-between text-sm bg-slate-800/60 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-slate-200 font-medium leading-tight">{item.product}</p>
                        <p className="text-slate-500 text-xs">
                          {item.qty} × RM {Number(item.unit_price).toFixed(2)}
                        </p>
                      </div>
                      <span className="text-slate-300 font-mono font-bold self-center ml-3">
                        RM {Number(item.subtotal).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Col 3: Total + Actions */}
              <div className="flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Total
                  </p>
                  <p className="text-3xl font-extrabold text-cyan-400 tracking-tight">
                    RM {Number(order.total_price).toFixed(2)}
                  </p>
                </div>

                <div className="flex flex-col gap-2 mt-6">
                  {/* ✅ Confirm */}
                  <form action={confirmOrder}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button
                      type="submit"
                      className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold py-2.5 px-4 rounded-xl transition-all duration-150 flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      确认下单 &amp; 预备发票
                    </button>
                  </form>

                  {/* ❌ Reject */}
                  <form action={rejectOrder}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button
                      type="submit"
                      className="w-full bg-slate-800 hover:bg-red-900/40 border border-slate-700 hover:border-red-700 active:scale-95 text-slate-400 hover:text-red-400 font-semibold py-2 px-4 rounded-xl transition-all duration-150 text-sm flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                      拒绝 / Reject
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
