import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface CustomerRow {
  wa_id: string;
  name: string;
  total_spent: number;
}

export interface MessageRow {
  role: 'user' | 'model';
  content: string;
}

export interface PriceTier {
  min_qty: number;
  max_qty: number | null;
  unit_price: number;
}

export interface ProductWithTiers {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  price_tiers: PriceTier[];
}

let _sb: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('[DB] 环境变量未配置');
    return null;
  }
  _sb = createClient(url, key, { auth: { persistSession: false } });
  return _sb;
}

export async function fetchOrCreateCustomer(
  sb: SupabaseClient,
  waId: string,
  name: string
): Promise<{ customer: CustomerRow; isNew: boolean }> {
  const { data } = await sb
    .from('customers')
    .select('wa_id,name,total_spent')
    .eq('wa_id', waId)
    .maybeSingle();

  if (data) {
    if (data.name !== name && name !== 'Boss') {
      await sb.from('customers').update({ name }).eq('wa_id', waId);
      data.name = name;
    }
    return { customer: data as CustomerRow, isNew: false };
  }

  const { data: created } = await sb
    .from('customers')
    .insert({ wa_id: waId, name, total_spent: 0 })
    .select('wa_id,name,total_spent')
    .single();

  return {
    customer: (created ?? { wa_id: waId, name, total_spent: 0 }) as CustomerRow,
    isNew: true,
  };
}

export async function fetchHistory(sb: SupabaseClient, waId: string, limit = 10): Promise<MessageRow[]> {
  const { data } = await sb
    .from('messages')
    .select('role,content')
    .eq('wa_id', waId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return ((data ?? []) as MessageRow[]).reverse();
}

export async function saveMessage(sb: SupabaseClient, waId: string, role: 'user' | 'model', content: string): Promise<void> {
  await sb.from('messages').insert({ wa_id: waId, role, content });
}

export async function fetchPricingFromDB(sb: SupabaseClient): Promise<ProductWithTiers[]> {
  const { data: products, error: pErr } = await sb
    .from('products')
    .select('id, sku, name, description, unit')
    .eq('is_active', true)
    .order('id');

  if (pErr || !products?.length) {
    if (pErr) console.error('[DB] 产品加载失败:', pErr.message);
    return [];
  }

  const productIds = products.map((p: { id: number }) => p.id);
  const { data: tiers, error: tErr } = await sb
    .from('price_tiers')
    .select('product_id, min_qty, max_qty, unit_price')
    .in('product_id', productIds)
    .order('product_id')
    .order('min_qty');

  if (tErr) console.error('[DB] 价格阶梯加载失败:', tErr.message);

  const tierMap = new Map<number, PriceTier[]>();
  for (const t of (tiers ?? []) as Array<{ product_id: number } & PriceTier>) {
    if (!tierMap.has(t.product_id)) tierMap.set(t.product_id, []);
    tierMap.get(t.product_id)!.push({
      min_qty: t.min_qty,
      max_qty: t.max_qty,
      unit_price: t.unit_price,
    });
  }

  return products.map((p: any) => ({
    ...p,
    price_tiers: tierMap.get(p.id) ?? [],
  }));
}

export function formatPricingBlock(products: ProductWithTiers[]): string {
  if (!products.length) {
    return '（产品价格数据暂时无法加载，请告知客户稍后确认）';
  }

  return products.map((p) => {
    const header = p.description ? `【${p.name}】（${p.description}）` : `【${p.name}】`;
    if (!p.price_tiers.length) return `${header}\n  （暂无报价）`;

    const tiers = p.price_tiers
      .map((t) => {
        const range = t.max_qty != null ? `${t.min_qty}–${t.max_qty}${p.unit}` : `≥${t.min_qty}${p.unit}`;
        return `${range}: RM ${Number(t.unit_price).toFixed(2)}/${p.unit}`;
      })
      .join(' | ');

    return `${header}\n  ${tiers}`;
  }).join('\n\n');
}

export async function saveOrder(sb: SupabaseClient, customerId: string, orderData: any) {
  const { error } = await sb.from('orders').insert({
    customer_id: customerId,
    items: orderData.items,
    total_price: orderData.total_price,
    status: 'pending_approval',
    notes: orderData.notes ?? null,
  });
  if (error) throw new Error(error.message);
}
