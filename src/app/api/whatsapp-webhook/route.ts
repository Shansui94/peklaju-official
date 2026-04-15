/**
 * Pek Laju WhatsApp Sales Agent — v3 (With Conversation Memory)
 *
 * Key upgrades:
 *  - Stores chat history in Supabase `messages` table
 *  - Passes last 10 messages to Gemini as full conversation context
 *  - Proactive closing: always ends with a CTA (address / confirm)
 *  - Uses Gemini system_instruction (not injected into user turn)
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

// ─────────────────────────────────────────────────────────────────
// Supabase (service role singleton)
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

/** 拉取该客户最近 N 条消息（按时间升序，用于 Gemini history） */
async function fetchHistory(sb: SupabaseClient, waId: string, limit = 10): Promise<MessageRow[]> {
  const { data } = await sb
    .from('messages')
    .select('role,content')
    .eq('wa_id', waId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return ((data ?? []) as MessageRow[]).reverse(); // 升序返回
}

/** 保存一条消息 */
async function saveMessage(
  sb: SupabaseClient, waId: string, role: 'user' | 'model', content: string,
): Promise<void> {
  await sb.from('messages').insert({ wa_id: waId, role, content });
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
// System Prompt (用作 Gemini system_instruction)
// ─────────────────────────────────────────────────────────────────
function buildSystemInstruction(customerName: string, isNew: boolean, totalSpent: number): string {
  const customerStatus = isNew
    ? '新客户（第一次联系，主动欢迎）'
    : totalSpent >= 5000
    ? `⭐ VIP 老客（累计 RM ${totalSpent.toFixed(2)}，可酌情给小优惠）`
    : `回头客（累计 RM ${totalSpent.toFixed(2)}）`;

  return `你是太平 Pek Laju (PackSecure) 的 WhatsApp 销售助理，由老板 Max Tan 授权。
客户：${customerName}（${customerStatus}）

═══════════════════════════════════════════
📦 2026年4月 官方报价（严禁编造、不可更改）
═══════════════════════════════════════════
拉伸膜 Stretch Film (2.2KG/箱，6卷/箱) — 透明/黑色同价：
  1–9箱    RM 120/箱  |  10–19箱  RM 117/箱  |  ≥20箱  RM 111/箱

气泡膜 Bubble Wrap (1M×100M/卷)：
  单层透明：1–81卷 RM 54 | ≥82卷 RM 47
  单层黑色：1–81卷 RM 64 | ≥82卷 RM 54
  双层黑色：1–81卷 RM 95 | ≥82卷 RM 87

快递袋 Courier Bag 17×30 黑色 (100pcs/卷)：RM 2.80/卷
运费：太平(Taiping)区内送货免运费，区外另计

═══════════════════════════════════════════
🎯 销售策略（必须严格执行）
═══════════════════════════════════════════
1. 【主动推进】每一条回复都必须以「行动呼吁」(CTA) 结尾：
   - 刚报价完 → 问"Boss 要多少箱/卷？"
   - 客户说数量 → 算总价 + 问"请问送货地址？"
   - 客户给地址 → 确认全单 + 问"OK 我帮你安排了？"
   - 客户确认 → 输出 [AUTO_ORDER] 并告知"我马上通知老板处理"

2. 【续接上下文】若客户说"然后呢"、"好"、"行"、"OK" 等模糊词：
   - 根据聊天记录判断他们在谈的是哪个产品/订单
   - 不要重新问"你要哪款产品"——直接推进下一步

3. 【语气】大马华语，叫客户"Boss"或"${customerName}"，简洁精准，像老行尊做生意

4. 【禁止】编造价格、废话连篇、numbered list（客户不需要产品目录）、重复问已经答过的问题

═══════════════════════════════════════════
🚨 订单检测（满足以下任一条 → 必须输出 [AUTO_ORDER]）
═══════════════════════════════════════════
触发条件：
  ✅ 客户说"我要X箱/卷"、"帮我安排"、"confirm"、"OK就这样"
  ✅ 客户询问或确认送货地址/日期
  ✅ 客户同意价格后说"行"/"好"/"要"

格式（回复文字后空两行，整个 JSON 放一行）：
[AUTO_ORDER: {"items":[{"product":"<产品名>","qty":<数量>,"unit_price":<单价>,"subtotal":<小计>}],"total_price":<总价>,"notes":"<地址或空字符串>"}]

⚠️ unit_price 必须来自上方报价表，自动选择正确阶梯价
⚠️ 若无明确购买意图 → 绝对不输出 [AUTO_ORDER]`;
}

// ─────────────────────────────────────────────────────────────────
// GET — Webhook Verification
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
// POST — Main Message Handler
// ─────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body    = await request.json();
    const change  = body.entry?.[0]?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    // 忽略状态回调 & 非文本
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

    // ① 蓝勾（并行）
    markRead(phoneId, token, messageId);

    // ② Supabase — 客户 + 对话历史
    const sb = getSupabase();
    let isNew      = false;
    let totalSpent = 0;
    let history: MessageRow[] = [];

    if (sb) {
      const [custResult, hist] = await Promise.all([
        fetchOrCreateCustomer(sb, from, waName),
        fetchHistory(sb, from, 10),
      ]);
      isNew      = custResult.isNew;
      totalSpent = custResult.customer.total_spent ?? 0;
      history    = hist;
      console.log(`[DB] ${from} | 新:${isNew} | RM${totalSpent} | 历史:${history.length}条`);

      // 保存这条用户消息
      await saveMessage(sb, from, 'user', text);
    }

    // ③ Gemini (带完整对话历史)
    let replyText               = '';
    let autoOrder: AutoOrder | null = null;

    if (!geminiKey) {
      replyText = '您好 Boss！系统维护中，请稍后联系。Pek Laju 感谢您！';
    } else {
      const systemInstruction = buildSystemInstruction(waName, isNew, totalSpent);

      // 构建 Gemini contents（历史 + 当前消息）
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

    // ⑤ 保存 AI 回复到历史（去掉已剥离的 [AUTO_ORDER] 标记后的干净文本）
    if (sb) {
      await saveMessage(sb, from, 'model', replyText);
    }

    // ⑥ 写入订单
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
    return NextResponse.json({ status: 'error_handled' }, { status: 200 });
  }
}