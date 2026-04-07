import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('hub.mode') === 'subscribe' && searchParams.get('hub.verify_token') === 'peklaju_2026_webhook') {
    return new NextResponse(searchParams.get('hub.challenge'), { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 抓取消息本体
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message || message.type !== 'text') {
      return NextResponse.json({ status: 'ok' });
    }

    const from = message.from;
    const text = message.text.body;
    const messageId = message.id; // 拿到这条消息的专属 ID

    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const token = process.env.WHATSAPP_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!phoneId || !token) return NextResponse.json({ status: 'ok' });

    // ⚡ 动作 1：强制点亮蓝勾 (Mark as read) ⚡
    await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
    });

    // 🧠 动作 2：召唤 AI 大脑思考
    let replyText = "";
    if (geminiKey) {
      console.log(`正在召唤 AI 大脑分析: "${text}"`);
      const aiReq = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{ text: `你是马来西亚太平 Pek Laju (拉伸膜/气泡膜制造厂) 的专属AI助理。老板Max刚刚对你说：“${text}”。请用一句机智、幽默且专业的中文怼回去或者回答他。` }]
          }]
        })
      });
      const aiRes = await aiReq.json();
      if (aiRes.candidates?.[0]?.content?.parts?.[0]?.text) {
        replyText = aiRes.candidates[0].content.parts[0].text;
      } else {
        replyText = "系统神经短暂短路，请老板稍后再试。";
      }
    } else {
      replyText = "老板，您还没在 Vercel 给我配置 GEMINI_API_KEY 这把钥匙呢！我没法思考！";
    }

    // 👄 动作 3：把 AI 的原话发回给客户
    await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: from,
        text: { body: replyText }
      }),
    });

    console.log("✅ AI 回复已发送: ", replyText);
    return NextResponse.json({ status: 'ok' });

  } catch (error) {
    console.error('Webhook 崩溃:', error);
    return NextResponse.json({ status: 'error_handled' }, { status: 200 });
  }
}