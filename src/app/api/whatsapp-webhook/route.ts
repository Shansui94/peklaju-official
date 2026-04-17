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
  const markerIdx = raw.indexOf('[AUTO_ORDER:');
  if (markerIdx === -1) return { order: null, cleanText: raw.trim() };

  // 截断标记之后所有内容，确保哪怕出错了也绝不发送给客户
  const cleanText = raw.substring(0, markerIdx).trim();
  let jsonStr = raw.substring(markerIdx + 12).trim();
  
  if (jsonStr.endsWith(']')) {
    jsonStr = jsonStr.substring(0, jsonStr.length - 1).trim();
  } else {
    const lastBracketIdx = jsonStr.lastIndexOf(']');
    if (lastBracketIdx !== -1) {
       jsonStr = jsonStr.substring(0, lastBracketIdx).trim();
    }
  }

  // 过滤可能的 markdown code block
  jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

  let order: AutoOrder | null = null;
  try { 
    order = JSON.parse(jsonStr) as AutoOrder; 

    // 自我修复校验：防止 AI 把 price 塞成 "RM 3854" 这样的字符串，导致 Supabase 数值列写入崩溃
    if (order) {
      if (typeof order.total_price === 'string') {
        order.total_price = Number(String(order.total_price).replace(/[^\d.]/g, ''));
      }
      if (order.items && Array.isArray(order.items)) {
        order.items = order.items.map(item => ({
          ...item,
          qty: typeof item.qty === 'string' ? Number(String(item.qty).replace(/[^\d.]/g, '')) : item.qty,
          unit_price: typeof item.unit_price === 'string' ? Number(String(item.unit_price).replace(/[^\d.]/g, '')) : item.unit_price,
          subtotal: typeof item.subtotal === 'string' ? Number(String(item.subtotal).replace(/[^\d.]/g, '')) : item.subtotal,
        }));
      }
    }
  } catch (e: any) { 
    console.warn('[Order] JSON 解析失败:', jsonStr, e); 
    // 直接推给客户端方便调试
    cleanText += `\n\n[系统报警] JSON 解析失败 (请截图给老板): ${e.message}\n截取内容: ${jsonStr.substring(0, 100)}`;
  }

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
  const customerStatus = isNew ? '新客户' : `老客（累计 RM ${totalSpent.toFixed(2)}）`;

  return `你是太平 Pek Laju (PackSecure) 的 WhatsApp 销售助理，受权于老板。
你是必须绝对服从指令的AI，请结合下方的【对话记录】服务客户！
客户信息：${customerName}（${customerStatus}）

【报价表】
${pricingBlock}
⚠️ 气泡膜单层透明 ≥82 卷锁死 RM 47.00/卷，绝不准多收或少收！
太平区免运费，区外另计。

【极其严格的操作规则（违规即摧毁）】
1. 统一尊称客户为“Boss”。不要再说“你好/哈咯”如果你们已经聊过。
2. 只要客户发了【收货地址】（比如包含 Lorong, Taiping, Taman, Jalan 等字眼的地址），
不要犹豫，绝对不要问“你需要什么产品”！直接从上文找他刚才买的产品和数量，
立刻、强制输出【结单回复】！不管上一次订单是不是发过了！只要有地址，立刻结单！
3. 【结单回复】必须长这样：
Boss，地址收到，单子已录入发给 Max 处理了。

[AUTO_ORDER: {"items":[{"product":"<提取客户要求的真实商品名(如 bubblewrap)>","qty":<数量>,"unit_price":<单价>,"subtotal":<金额>}],"total_price":<总价>,"notes":"<原样填入地址>"}]

4. 没发地址的时候：
- 他只问价，你报价，并问"要多少？"。
- 他确认了数量，你算总价，并问"Boss要送去哪里？"。
- 凡是你问了"送去哪里"，只要客户接着回答的哪怕只言片语，都当做地址！立刻跳回第2点强制输出【结单回复】！

5. 客户在结单后的闲聊：
只要你已经回复过【地址收到，单子已录入】，客户如果随后追问诸如“发票呢”、“多长时间发货”或者只说“好的/Thanks”，你一律简单回答：“没问题Boss，Max老板随后会处理好的！”。**绝不允许因为闲聊就跳回最初去问客户要买什么材料！**`;
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
        fetchHistory(sb, from, 25),
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
      if (error) {
        console.error('[DB] 订单写入失败:', error.message);
        await sendWhatsApp(phoneId, token, from, `\n[系统报警] 订单未能存入系统 (请截图给老板): ${error.message}`);
      } else {
        console.log(`[DB] ✅ 订单 RM${autoOrder.total_price} | ${autoOrder.items.length}项`);
      }
    }

    return NextResponse.json({ status: 'ok' });

  } catch (err) {
    console.error('[Webhook] 未捕获异常:', err);
    // 永远返回 200，避免 WhatsApp 重复推送
    return NextResponse.json({ status: 'error_handled' }, { status: 200 });
  }
}