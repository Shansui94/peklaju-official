/**
 * Pek Laju WhatsApp Sales Agent — Final Version
 * Stack: Next.js App Router · Supabase · Meta WhatsApp Cloud API · Gemini 2.5 Flash
 *
 * Flow:
 *  GET  → WhatsApp webhook verification
 *  POST → 1. Mark as read
 *          2. Fetch / create customer in Supabase
 *          3. Call Gemini with full context (pricing + customer status)
 *          4. Parse [AUTO_ORDER:{...}] intent block
 *          5. Send reply to customer (without the JSON block)
 *          6. If order detected → insert into orders table
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
  created_at:  string;
}

// ─────────────────────────────────────────────────────────────────
// Supabase singleton (service role — bypasses RLS)
// ─────────────────────────────────────────────────────────────────
let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('[DB] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未配置');
    return null;
  }
  _supabase = createClient(url, key, {
    auth: { persistSession: false },
  });
  return _supabase;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** 发送 WhatsApp 消息 */
async function sendWhatsApp(
  phoneId: string,
  token: string,
  to: string,
  text: string,
): Promise<void> {
  const res = await fetch(
    `https://graph.facebook.com/v18.0/${phoneId}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, text: { body: text } }),
    },
  );
  if (!res.ok) {
    console.error('[WA] 发送失败:', await res.text());
  }
}

/** 标记消息已读（蓝勾） */
async function markRead(phoneId: string, token: string, messageId: string): Promise<void> {
  await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
  });
}

/** 拉取客户资料，若不存在则立刻创建 */
async function fetchOrCreateCustomer(
  supabase: SupabaseClient,
  waId: string,
  name: string,
): Promise<{ customer: CustomerRow; isNew: boolean }> {
  // 先查
  const { data: existing } = await supabase
    .from('customers')
    .select('wa_id, name, total_spent, created_at')
    .eq('wa_id', waId)
    .maybeSingle();

  if (existing) {
    // 顺便更新名字（如果 WA 改过显示名）
    if (existing.name !== name && name !== 'Boss') {
      await supabase.from('customers').update({ name }).eq('wa_id', waId);
      existing.name = name;
    }
    return { customer: existing as CustomerRow, isNew: false };
  }

  // 新客户 → 写入
  const { data: created, error } = await supabase
    .from('customers')
    .insert({ wa_id: waId, name, total_spent: 0 })
    .select('wa_id, name, total_spent, created_at')
    .single();

  if (error) {
    console.error('[DB] 新建客户失败:', error.message);
    // 降级：返回一个空壳，不阻断流程
    return {
      customer: { wa_id: waId, name, total_spent: 0, created_at: new Date().toISOString() },
      isNew: true,
    };
  }
  return { customer: created as CustomerRow, isNew: true };
}

/** 解析 AI 输出的 [AUTO_ORDER:{...}] 标记 */
function parseAutoOrder(rawOutput: string): { order: AutoOrder | null; cleanText: string } {
  const match = rawOutput.match(/\[AUTO_ORDER:\s*(\{[\s\S]*?\})\]/);
  if (!match) return { order: null, cleanText: rawOutput.trim() };

  let order: AutoOrder | null = null;
  try {
    order = JSON.parse(match[1]) as AutoOrder;
  } catch (e) {
    console.warn('[Order] JSON 解析失败:', match[1], e);
  }

  const cleanText = rawOutput.replace(/\[AUTO_ORDER:\s*\{[\s\S]*?\}\]/, '').trim();
  return { order, cleanText };
}

// ─────────────────────────────────────────────────────────────────
// System Prompt Builder
// ─────────────────────────────────────────────────────────────────
function buildSystemPrompt(customerName: string, isNew: boolean, totalSpent: number, userText: string): string {
  const vipTag = totalSpent >= 5000
    ? `⭐ VIP 客户（累计消费 RM ${totalSpent.toFixed(2)}，可酌情优待）`
    : totalSpent > 0
    ? `回头客（累计消费 RM ${totalSpent.toFixed(2)}）`
    : '新客户（第一次联系）';

  return `你是太平 Pek Laju (PackSecure) 的官方 WhatsApp 销售助理，由老板 Max Tan 授权运营。
客户状态：${isNew ? '🆕 新客户，刚刚建档' : vipTag}

════════════════════════════════════════════
📦  2026年4月 官方报价单（严格遵守，绝不编造）
════════════════════════════════════════════

【拉伸膜 Stretch Film 2.2KG/箱，6卷/箱】
  透明 (Clear) & 黑色 (Black) 同价：
  ├ 1–9 箱    → RM 120.00/箱 (RM 20.00/卷)
  ├ 10–19 箱  → RM 117.00/箱 (RM 19.50/卷)
  └ ≥ 20 箱 (1托盘) → RM 111.00/箱 (RM 18.50/卷)

【气泡膜 Bubble Wrap 1M × 100M/卷】
  ┌ 单层透明 (Single Clear):
  │  ├ 1–81 卷  → RM 54.00/卷
  │  └ ≥ 82 卷 → RM 47.00/卷
  ├ 单层黑色 (Single Black):
  │  ├ 1–81 卷  → RM 64.00/卷
  │  └ ≥ 82 卷 → RM 54.00/卷
  └ 双层黑色 (Double Black):
     ├ 1–81 卷  → RM 95.00/卷
     └ ≥ 82 卷 → RM 87.00/卷

【黑色快递袋 Black Courier Bag 17×30cm，100pcs/卷】
  └ 任意数量  → RM 2.80/卷

════════════════════════════════════════════
📋  回复规则（必须遵守）
════════════════════════════════════════════
- 称呼客户：叫 "Boss" 或 "${customerName}"，不要叫"您"
- 语气：大马华语，精明、直接、稳重，像老江湖做生意
- 报价时：直接给数字，写清楚单位（箱/卷）和总价
- 运费：太平(Taiping)区内送货 免运费，区外另计
- 禁止：幻觉报价、比喻、废话、夸大宣传
- 若客户问你不知道的产品/规格：如实说"这个要帮您问过老板再确认"

════════════════════════════════════════════
🚨  订单意图检测（最重要，必须执行）
════════════════════════════════════════════
判断标准——满足以下任意一条即为"有购买意图"：
  ✅ 客户明确说要买（"我要XX箱"、"帮我安排"、"confirm了"、"OK就这样"）
  ✅ 客户询问送货安排（地址、日期、几时到）
  ✅ 客户在讨价还价后说"好"或"行"

若判断为有购买意图：
  1. 先正常回复客户（几句话，简洁确认订单细节）
  2. 在回复末尾空两行，追加以下格式（一行，不换行）：

[AUTO_ORDER: {"items":[{"product":"<产品名>","qty":<数量>,"unit_price":<单价>,"subtotal":<行小计>}],"total_price":<总价>,"notes":"<送货备注或空字符串>"}]

示例（客户要10箱黑色拉伸膜送到太平）：
好的 Boss！10箱黑色拉伸膜 RM 1,170.00，太平区内免运费，我安排给你。请问送货地址？

[AUTO_ORDER: {"items":[{"product":"黑色拉伸膜 2.2KG","qty":10,"unit_price":117,"subtotal":1170}],"total_price":1170,"notes":"太平区内送货"}]

⚠️ 若无明确购买意图，只正常回复，绝对不输出 [AUTO_ORDER:...]
⚠️ items 里的 unit_price 必须来自上方报价单，不可自行发明

════════════════════════════════════════════
客户说："${userText}"
════════════════════════════════════════════`;
}

// ─────────────────────────────────────────────────────────────────
// GET — WhatsApp Webhook Verification
// ─────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (
    searchParams.get('hub.mode') === 'subscribe' &&
    searchParams.get('hub.verify_token') === 'peklaju_2026_webhook'
  ) {
    return new NextResponse(searchParams.get('hub.challenge'), {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  return NextResponse.json({ error: 'Invalid verify token' }, { status: 403 });
}

// ─────────────────────────────────────────────────────────────────
// POST — Incoming Message Handler
// ─────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // ── 解包消息 ─────────────────────────────────────────────────
    const entry   = body.entry?.[0];
    const change  = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    // 忽略状态回调（delivered/read receipt）和非文本消息
    if (!message || message.type !== 'text') {
      return NextResponse.json({ status: 'ok' });
    }

    const from: string       = message.from;         // "60123456789"
    const text: string       = message.text.body;
    const messageId: string  = message.id;
    const waName: string     = change?.contacts?.[0]?.profile?.name ?? 'Boss';

    const phoneId   = process.env.WHATSAPP_PHONE_ID;
    const token     = process.env.WHATSAPP_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!phoneId || !token) {
      console.error('[Config] WHATSAPP_PHONE_ID 或 WHATSAPP_TOKEN 未设置');
      return NextResponse.json({ status: 'ok' });
    }

    console.log(`[MSG] ${from} (${waName}): "${text}"`);

    // ── 动作 1：蓝勾 (并行，不阻断主流程) ───────────────────────
    markRead(phoneId, token, messageId).catch(console.error);

    // ── 动作 2：Supabase — 获取 / 创建客户 ──────────────────────
    const supabase = getSupabase();
    let isNew = false;
    let totalSpent = 0;

    if (supabase) {
      const result = await fetchOrCreateCustomer(supabase, from, waName);
      isNew      = result.isNew;
      totalSpent = result.customer.total_spent ?? 0;
      console.log(`[DB] 客户: ${from} | 新客户:${isNew} | 累计:RM${totalSpent}`);
    }

    // ── 动作 3：Gemini AI ─────────────────────────────────────────
    let replyText    = '';
    let autoOrder: AutoOrder | null = null;

    if (!geminiKey) {
      replyText = '您好 Boss！系统正在维护中，请稍后再联系。Pek Laju 感谢您！';
    } else {
      const prompt = buildSystemPrompt(waName, isNew, totalSpent, text);

      const aiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature:    0.3,   // 低温 = 报价稳定，不乱报
              maxOutputTokens: 600,
            },
          }),
        },
      );

      const aiJson  = await aiRes.json();
      const rawText: string = aiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      if (!rawText) {
        console.error('[AI] 空响应:', JSON.stringify(aiJson).substring(0, 200));
        replyText = '系统暂时无法回应，请稍候再试。谢谢 Boss！';
      } else {
        const parsed  = parseAutoOrder(rawText);
        autoOrder     = parsed.order;
        replyText     = parsed.cleanText;
        if (autoOrder) {
          console.log('[AI] 检测到订单意图:', JSON.stringify(autoOrder));
        }
      }
    }

    // ── 动作 4：发送 WhatsApp 回复 ────────────────────────────────
    await sendWhatsApp(phoneId, token, from, replyText);
    console.log(`[WA] 已回复 ${from}: "${replyText.substring(0, 120)}..."`);

    // ── 动作 5：写入订单 ─────────────────────────────────────────
    if (supabase && autoOrder) {
      const { error: orderErr } = await supabase.from('orders').insert({
        customer_id: from,
        items:       autoOrder.items,
        total_price: autoOrder.total_price,
        status:      'pending_approval',
        notes:       autoOrder.notes ?? null,
      });

      if (orderErr) {
        console.error('[DB] 订单写入失败:', orderErr.message);
      } else {
        console.log(
          `[DB] ✅ 订单已创建 | 客户:${from} | RM${autoOrder.total_price} | ${autoOrder.items.length}项产品`,
        );
      }
    }

    return NextResponse.json({ status: 'ok' });

  } catch (err) {
    // 永远返回 200，避免 WhatsApp 重复推送
    console.error('[Webhook] 未捕获异常:', err);
    return NextResponse.json({ status: 'error_handled' }, { status: 200 });
  }
}