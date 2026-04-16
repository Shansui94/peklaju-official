/**
 * Pek Laju WhatsApp Sales Agent — v4 (DB-Driven Pricing)
 *
 * Changes from v3:
 *  - Pricing loaded dynamically from Supabase `products` + `price_tiers` tables
 *  - buildSystemInstruction() accepts a pre-formatted pricingBlock string
 *  - fetchPricingFromDB() + formatPricingBlock() handle DB → prompt conversion
 *  - All v3 features retained: conversation history, AUTO_ORDER, VIP detection
 */

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────
interface OrderItem {
  product:    string;
  qty:        number;
  unit_price: number;
  subtotal:   number;
}

interface AutoOrder {
  items:       OrderItem[];
  total_price: number;
  notes?:      string;
}

interface CustomerRow {
  wa_id:       string;
  name:        string;
  total_spent: number;
}

interface MessageRow {
  role:    'user' | 'model';
  content: string;
}

interface PriceTier {
  min_qty:    number;
  max_qty:    number | null;
  unit_price: number;
}

interface ProductWithTiers {
  id:          number;
  sku:         string;
  name:        string;
  description: string | null;
  unit:        string;
  price_tiers: PriceTier[];
}

// ─────────────────────────────────────────────────────────────────
// Supabase singleton (service role — bypasses RLS)
// ─────────────────────────────────────────────────────────────────
let _sb: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.warn('[DB] 环境变量未配置'); return null; }
  _sb = createClient(url, key, { auth: { persistSession: false } });
  return _sb;
}

// ─────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────

async function fetchOrCreateCustomer(
  sb: SupabaseClient, waId: string, name: string,
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

/** 拉取该客户最近 N 条消息（升序返回，用于 Gemini history） */
async function fetchHistory(sb: SupabaseClient, waId: string, limit = 10): Promise<MessageRow[]> {
  const { data } = await sb
    .from('messages')
    .select('role,content')
    .eq('wa_id', waId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return ((data ?? []) as MessageRow[]).reverse();
}

/** 保存一条消息 */
async function saveMessage(
  sb: SupabaseClient, waId: string, role: 'user' | 'model', content: string,
): Promise<void> {
  await sb.from('messages').insert({ wa_id: waId, role, content });
}

/**
 * 从数据库获取所有启用产品及其阶梯价格。
 * 若 DB 不可用或无数据，返回空数组（调用方会降级到静态提示）。
 */
async function fetchPricingFromDB(sb: SupabaseClient): Promise<ProductWithTiers[]> {
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
      min_qty:    t.min_qty,
      max_qty:    t.max_qty,
      unit_price: t.unit_price,
    });
  }

  return products.map((p: { id: number; sku: string; name: string; description: string | null; unit: string }) => ({
    ...p,
    price_tiers: tierMap.get(p.id) ?? [],
  }));
}

/**
 * 将产品+阶梯价格格式化为 system prompt 可用的文本块。
 *
 * 输出示例：
 * 【黑色拉伸膜 Black Stretch Film】(2.2KG/箱，6卷/箱)
 *   1–9箱: RM 120.00/箱 | 10–19箱: RM 117.00/箱 | 20–50箱: RM 114.00/箱
 */
function formatPricingBlock(products: ProductWithTiers[]): string {
  if (!products.length) {
    return '（产品价格数据暂时无法加载，请告知客户稍后确认）';
  }

  return products.map((p) => {
    const header = p.description
      ? `【${p.name}】（${p.description}）`
      : `【${p.name}】`;

    if (!p.price_tiers.length) return `${header}\n  （暂无报价）`;

    const tiers = p.price_tiers
      .map((t) => {
        const range = t.max_qty != null
          ? `${t.min_qty}–${t.max_qty}${p.unit}`
          : `≥${t.min_qty}${p.unit}`;
        return `${range}: RM ${Number(t.unit_price).toFixed(2)}/${p.unit}`;
      })
      .join(' | ');

    return `${header}\n  ${tiers}`;
  }).join('\n\n');
}

// ─────────────────────────────────────────────────────────────────
// WhatsApp helpers
// ─────────────────────────────────────────────────────────────────
async function markRead(phoneId: string, token: string, msgId: string) {
  await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: msgId }),
  }).catch(console.error);
}

async function sendWhatsApp(phoneId: string, token: string, to: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, text: { body: text } }),
  });
  if (!res.ok) console.error('[WA] 发送失败:', await res.text());
}

// ─────────────────────────────────────────────────────────────────
// Parse [AUTO_ORDER: {...}]
// ─────────────────────────────────────────────────────────────────
function parseAutoOrder(raw: string): { order: AutoOrder | null; cleanText: string } {
  const match = raw.match(/\[AUTO_ORDER:\s*(\{[\s\S]*?\})\]/);
  if (!match) return { order: null, cleanText: raw.trim() };

  let order: AutoOrder | null = null;
  try { order = JSON.parse(match[1]) as AutoOrder; }
  catch (e) { console.warn('[Order] JSON 解析失败:', match[1], e); }

  const cleanText = raw.replace(/\[AUTO_ORDER:\s*\{[\s\S]*?\}\]/, '').trim();
  return { order, cleanText };
}

// ─────────────────────────────────────────────────────────────────
// System Instruction builder (pricing injected dynamically)
// ─────────────────────────────────────────────────────────────────
function buildSystemInstruction(
  customerName: string,
  isNew: boolean,
  totalSpent: number,
  pricingBlock: string,
): string {
  const customerStatus = isNew
    ? '新客户'
    : totalSpent >= 5000
    ? `⭐ VIP（累计 RM ${totalSpent.toFixed(2)}）`
    : `回头客（累计 RM ${totalSpent.toFixed(2)}）`;

  return `你是太平 Pek Laju (PackSecure) 的 WhatsApp 销售助理，受权于老板。
你是极其聪明、不会失忆的高级助手。你的上下文里包含了我们之前的聊天记录。请随时翻看！
客户信息：${customerName}（${customerStatus}）

═══════════════════════════════════════════
📦 官方报价单 (2026年4月)
═══════════════════════════════════════════
${pricingBlock}

⚠️ 报价单单位锁：气泡膜单层透明 ≥82 卷的价格必须锁定为 RM 47.00/卷！不准多收或少收。
如果不到 82 卷，按阶梯价报。若是整捆（82卷）以上，就是 RM 47.00 固定价。
默认运费：太平区内免运费，区外另计。

═══════════════════════════════════════════
🎯 逻辑状态机（严格执行最高优先级逻辑）
═══════════════════════════════════════════
请务必结合你的「对话历史记录(History)」来判断当前处于什么状态！

- 状态 [询价中]： 客户刚问价格。你报阶梯价 -> 直接问“要几卷/箱？”
- 状态 [成交中]： 只要历史记录里已经出现了【产品 SKU】和【数量】，你的唯一目标就自动切换为“索要地址”（如：Boss要送去哪里？）。不要再重新问产品或数量。
- 状态 [结单中]： 只要你收到的是【地址】（例如：Lorong Jaya、Taiping 或任何能代表送货目的地的地点），且之前已经讲好了产品和数量，必须立刻、强制只输出 [AUTO_ORDER] JSON 块！

═══════════════════════════════════════════
🚫 禁令（Anti-Dumb Mode，违规会被断电！）
═══════════════════════════════════════════
1. 严禁失忆/反问： 拿到地址后，绝对禁止问“你要什么材料”、“请问刚才确认的订单对吗”。你已经有历史记录了，直接去开单！
2. 严禁寒暄： 只要不是今天第一句，绝对禁止说“你好”、“欢迎”、“哈咯”、“有什么可以帮你”。
3. 严禁啰嗦称呼： 统一叫“Boss”，禁止出现类似“Boss Max Tan”或念全名的称呼。

一旦触发在 [结单中] 输出 [AUTO_ORDER]，你的文字回复必须一字不差地是：“Boss，地址收到，发票已发给你了，这就安排发货！” 然后立刻跟上 JSON。

═══════════════════════════════════════════
🚨 订单生成格式
═══════════════════════════════════════════
格式（回复文字后空两行，整个 JSON 必须放在一行）：
[AUTO_ORDER: {"items":[{"product":"<产品名>","qty":<数量>,"unit_price":<强制结算单价>,"subtotal":<小计>}],"total_price":<总价>,"notes":"<送货具体地址>"}]

⚠️ 若你还没问出地址或还没讲好订单总价，不要输出这行！`;
}

// ─────────────────────────────────────────────────────────────────
// GET — Webhook Verification
// ─────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (
    searchParams.get('hub.mode') === 'subscribe' &&
    searchParams.get('hub.verify_token') === (process.env.WHATSAPP_VERIFY_TOKEN ?? 'peklaju_2026_webhook')
  ) {
    return new NextResponse(searchParams.get('hub.challenge'), {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  return NextResponse.json({ error: 'Invalid verify token' }, { status: 403 });
}

// ─────────────────────────────────────────────────────────────────
// POST — Main Message Handler
// ─────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body    = await request.json();
    const change  = body.entry?.[0]?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    // 忽略状态回调 & 非文本消息
    if (!message || message.type !== 'text') {
      return NextResponse.json({ status: 'ok' });
    }

    const from:      string = message.from;
    const text:      string = message.text.body;
    const messageId: string = message.id;
    const waName:    string = change?.contacts?.[0]?.profile?.name ?? 'Boss';

    const phoneId   = process.env.WHATSAPP_PHONE_ID;
    const token     = process.env.WHATSAPP_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!phoneId || !token) {
      console.error('[Config] 缺少 WHATSAPP_PHONE_ID / WHATSAPP_TOKEN');
      return NextResponse.json({ status: 'ok' });
    }

    console.log(`[MSG] ${from} (${waName}): "${text}"`);

    // ① 蓝勾（并行，不阻断主流程）
    markRead(phoneId, token, messageId);

    // ② Supabase — 并行获取：客户资料 + 对话历史 + 产品报价
    const sb = getSupabase();
    let isNew        = false;
    let totalSpent   = 0;
    let history: MessageRow[]        = [];
    let pricingBlock = '（产品报价加载失败，请联系 Max Boss 确认）';

    if (sb) {
      const [custResult, hist, products] = await Promise.all([
        fetchOrCreateCustomer(sb, from, waName),
        fetchHistory(sb, from, 10),
        fetchPricingFromDB(sb),
      ]);

      isNew        = custResult.isNew;
      totalSpent   = custResult.customer.total_spent ?? 0;
      history      = hist;
      pricingBlock = formatPricingBlock(products);

      console.log(
        `[DB] ${from} | 新:${isNew} | RM${totalSpent} | ` +
        `历史:${history.length}条 | 产品:${products.length}款`,
      );

      // 保存用户消息
      await saveMessage(sb, from, 'user', text);
    }

    // ③ Gemini AI（带完整对话历史 + 动态报价）
    let replyText               = '';
    let autoOrder: AutoOrder | null = null;

    if (!geminiKey) {
      replyText = '您好 Boss！系统维护中，请稍后联系。Pek Laju 感谢您！';
    } else {
      const systemInstruction = buildSystemInstruction(waName, isNew, totalSpent, pricingBlock);

      type GeminiPart    = { text: string };
      type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };
      const contents: GeminiContent[] = [
        ...history.map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
        { role: 'user', parts: [{ text }] },
      ];

      const aiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents,
            generationConfig: {
              temperature:     0.3,
              maxOutputTokens: 800,
            },
          }),
        },
      );

      const aiJson  = await aiRes.json();
      const rawText: string = aiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      if (!rawText) {
        console.error('[AI] 空响应:', JSON.stringify(aiJson).substring(0, 300));
        replyText = '系统暂时无法回应，请稍候再试。谢谢 Boss！';
      } else {
        const parsed = parseAutoOrder(rawText);
        autoOrder    = parsed.order;
        replyText    = parsed.cleanText;
        if (autoOrder) console.log('[AI] 检测到订单:', JSON.stringify(autoOrder));
      }
    }

    // ④ 发 WhatsApp 回复
    await sendWhatsApp(phoneId, token, from, replyText);
    console.log(`[WA] 已回复 ${from}: "${replyText.substring(0, 120)}"`);

    // ⑤ 保存 AI 回复到历史
    if (sb) {
      await saveMessage(sb, from, 'model', replyText);
    }

    // ⑥ 写入订单（若 AI 检测到购买意图）
    if (sb && autoOrder) {
      const { error } = await sb.from('orders').insert({
        customer_id: from,
        items:       autoOrder.items,
        total_price: autoOrder.total_price,
        status:      'pending_approval',
        notes:       autoOrder.notes ?? null,
      });
      if (error) console.error('[DB] 订单写入失败:', error.message);
      else console.log(`[DB] ✅ 订单 RM${autoOrder.total_price} | ${autoOrder.items.length}项`);
    }

    return NextResponse.json({ status: 'ok' });

  } catch (err) {
    console.error('[Webhook] 未捕获异常:', err);
    // 永远返回 200，避免 WhatsApp 重复推送
    return NextResponse.json({ status: 'error_handled' }, { status: 200 });
  }
}