import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─── Supabase Client (service role — bypasses RLS) ───────────────────────────
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('[Supabase] 环境变量未配置，跳过数据库操作');
    return null;
  }
  return createClient(url, key);
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrderData {
  product_details: string;
  quantity: number;
  total_price: number;
}

// ─── WhatsApp Webhook Verification (GET) ──────────────────────────────────────
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
  return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
}

// ─── Incoming Message Handler (POST) ─────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message || message.type !== 'text') {
      return NextResponse.json({ status: 'ok' });
    }

    const from: string = message.from;         // e.g. "60123456789"
    const text: string = message.text.body;
    const messageId: string = message.id;

    // 客户 WhatsApp 显示名
    const contacts = body.entry?.[0]?.changes?.[0]?.value?.contacts;
    const customerName: string = contacts?.[0]?.profile?.name ?? 'Boss';

    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const token   = process.env.WHATSAPP_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!phoneId || !token) return NextResponse.json({ status: 'ok' });

    // ─── 动作 1：点亮蓝勾 (Mark as read) ────────────────────────────────────
    await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });

    // ─── 动作 2：Gemini AI 销售助理（含订单意图检测）─────────────────────────
    let replyText = '';
    let orderData: OrderData | null = null;

    const systemPrompt = `
你是太平 Pek Laju (PackSecure) 的官方 WhatsApp 销售助理。老板是 Max Tan。
你的目标：快速报出 2026年4月 批发价，识别客户购买意图，引导客户确认下单。

════════════════════════════════════
📦 核心报价单（严格遵守，不可编造）
════════════════════════════════════
1. 黑色拉伸膜 Black Stretch Film (2.2KG/箱，6卷/箱):
   - 1–9箱:   RM 120.00/箱 (RM 20.00/卷)
   - 10–19箱: RM 117.00/箱
   - ≥ 1托盘 (20箱+): RM 111.00/箱

2. 黑色气泡膜 Black Bubble Wrap (1M × 100M):
   - 单层 (Single): 1–81卷 RM 64.00/卷; ≥82卷 RM 54.00/卷
   - 双层 (Double): 1–81卷 RM 95.00/卷; ≥82卷 RM 87.00/卷

3. 黑色快递袋 Black Courier Bag (17×30cm, 100pcs/卷):
   - 1–2箱 (50卷+): RM 2.80/卷

════════════════════════════════════
📋 回复规则
════════════════════════════════════
- 称呼客户: "Boss" 或 "${customerName}"
- 风格: 简洁、专业、直接给价格
- 运费: 太平(Taiping)区内送货免运费
- 禁止: 编造产品、夸大宣传、废话连篇

════════════════════════════════════
🚨 订单意图检测（非常重要）
════════════════════════════════════
若客户的消息符合以下任意情况：
  ✅ 明确说要买（"我要"、"要XX箱"、"帮我安排"、"可以送货吗"、"确认了"）
  ✅ 询问送货细节（地址、日期、到货时间）
  ✅ 讨价还价后同意价格

则必须在你的回复文字末尾（用两个换行隔开），追加以下格式的 JSON 标记（不要换行）：
[ORDER_DATA: {"product_details":"<产品描述>","quantity":<数量>,"total_price":<总价RM数字>}]

示例（客户要买10箱拉伸膜）：
好的 Boss！10箱黑色拉伸膜，RM 1,170.00。我们安排送货给您，请问送货地址是？

[ORDER_DATA: {"product_details":"黑色拉伸膜 2.2KG x 10箱","quantity":10,"total_price":1170}]

⚠️ 若无明确购买意图，禁止输出 [ORDER_DATA:...]，只正常回复即可。

════════════════════════════════════
客户说："${text}"
════════════════════════════════════
`;

    if (geminiKey) {
      console.log(`[AI] 来自 ${from} (${customerName}): "${text}"`);

      const aiReq = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
          }),
        }
      );

      const aiRes = await aiReq.json();
      const rawOutput: string = aiRes.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      if (!rawOutput) {
        console.error('[AI] 无效响应:', JSON.stringify(aiRes));
        replyText = '系统暂时无法回应，请稍后再联系。谢谢！';
      } else {
        // ── 解析 [ORDER_DATA: {...}] 标记 ────────────────────────────────
        const orderMatch = rawOutput.match(/\[ORDER_DATA:\s*(\{[\s\S]*?\})\]/);
        if (orderMatch) {
          try {
            orderData = JSON.parse(orderMatch[1]) as OrderData;
            console.log('[Order] 检测到订单意图:', orderData);
          } catch (e) {
            console.warn('[Order] JSON 解析失败:', orderMatch[1], e);
          }
          // 从发给客户的消息里移除 JSON 标记（客户看不到内部标记）
          replyText = rawOutput.replace(/\[ORDER_DATA:\s*\{[\s\S]*?\}\]/, '').trim();
        } else {
          replyText = rawOutput.trim();
        }
      }
    } else {
      replyText = '您好！销售系统配置中，请稍后联系。Pek Laju 感谢您的耐心！';
    }

    // ─── 动作 3：发送回复给客户 ────────────────────────────────────────────
    await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: from,
        text: { body: replyText },
      }),
    });
    console.log(`[OK] 已回复 ${from}: "${replyText.substring(0, 100)}..."`);

    // ─── 动作 4：写入 Supabase ────────────────────────────────────────────
    const supabase = getSupabase();
    if (supabase) {
      // 4a. upsert 客户（wa_id 已存在则跳过，不存在则新建）
      const { error: customerErr } = await supabase
        .from('customers')
        .upsert(
          { wa_id: from, name: customerName },
          { onConflict: 'wa_id', ignoreDuplicates: true }
        );
      if (customerErr) console.error('[DB] 客户 upsert 失败:', customerErr.message);
      else console.log(`[DB] 客户已同步: ${from} (${customerName})`);

      // 4b. 若检测到订单意图，写入 orders 表
      if (orderData) {
        const { error: orderErr } = await supabase.from('orders').insert({
          customer_id:     from,
          product_details: orderData.product_details,
          quantity:        orderData.quantity ?? null,
          total_price:     orderData.total_price ?? null,
          status:          'pending_approval',
        });
        if (orderErr) console.error('[DB] 订单写入失败:', orderErr.message);
        else console.log(`[DB] ✅ 订单已创建: ${orderData.product_details} RM${orderData.total_price}`);
      }
    }

    return NextResponse.json({ status: 'ok' });

  } catch (error) {
    console.error('[Webhook Error]', error);
    return NextResponse.json({ status: 'error_handled' }, { status: 200 });
  }
}