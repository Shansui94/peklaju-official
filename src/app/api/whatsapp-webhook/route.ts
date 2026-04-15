import { NextResponse } from 'next/server';

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

    const from: string = message.from;
    const text: string = message.text.body;
    const messageId: string = message.id;

    // 尝试获取客户名称（profile name）
    const contacts = body.entry?.[0]?.changes?.[0]?.value?.contacts;
    const customerName: string = contacts?.[0]?.profile?.name ?? 'Boss';

    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const token = process.env.WHATSAPP_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!phoneId || !token) return NextResponse.json({ status: 'ok' });

    // ⚡ 动作 1：点亮蓝勾 (Mark as read)
    await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });

    // 🧠 动作 2：Gemini AI 销售助理
    let replyText = '';

    if (geminiKey) {
      const systemPrompt = `
你是太平 Pek Laju (PackSecure) 的官方销售助理。老板是 Max。
你的目标是：快速、准确地报出 2026年4月 的批发价，并引导客户下单。

[核心报价单 - 严格遵守]
1. 黑色拉伸膜 (Black Stretch Film 2.2KG):
   - 1-9箱: RM120.00/箱 (每卷 RM20.00)
   - 10-19箱: RM117.00/箱
   - 1托盘 (Pallet): RM111.00/箱
2. 黑色气泡膜 (Black Bubble Wrap 1M x 100M):
   - 单层黑色: 1-9卷 RM64.00; 82卷以上 RM54.00
   - 双层黑色: 1-9卷 RM95.00; 82卷以上 RM87.00
3. 黑色快递袋 (Black Courier Bag 17x30cm):
   - 1-3箱: RM2.80/卷 (100pcs)

[回复原则]
- 禁忌：禁止编造产品用途，禁止卖弄文采。
- 称呼：叫客户 "Boss" 或 "${customerName}"。
- 风格：老练、稳重、效率第一。直接告诉客户规格和对应的阶梯价。
- 运费：明确告知太平(Taiping)区内免运费送货。

客户说："${text}"
`;

      console.log(`[AI] 处理来自 ${from} (${customerName}) 的消息: "${text}"`);

      const aiReq = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: systemPrompt }],
              },
            ],
          }),
        }
      );

      const aiRes = await aiReq.json();
      if (aiRes.candidates?.[0]?.content?.parts?.[0]?.text) {
        replyText = aiRes.candidates[0].content.parts[0].text;
      } else {
        console.error('[AI] 无效响应:', JSON.stringify(aiRes));
        replyText = '系统暂时无法回应，请稍后再联系我们。谢谢！';
      }
    } else {
      replyText = '您好！销售系统正在配置中，请稍后联系我们。太平 Pek Laju 感谢您的耐心！';
    }

    // 👄 动作 3：发送 AI 回复给客户
    await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: from,
        text: { body: replyText },
      }),
    });

    console.log(`[OK] 已回复 ${from}: ${replyText.substring(0, 80)}...`);
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[Webhook Error]', error);
    return NextResponse.json({ status: 'error_handled' }, { status: 200 });
  }
}