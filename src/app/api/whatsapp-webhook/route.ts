import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === 'peklaju_2026_webhook') {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('\n--- 新的 WhatsApp 消息 ---');
    console.log(JSON.stringify(body, null, 2));
    console.log('--------------------------');

    // 检查是否包含客户发来的文本消息
    if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const message = body.entry[0].changes[0].value.messages[0];
      const from = message.from; // 客户的手机号
      const text = message.text?.body; // 客户发来的文字

      if (text) {
        console.log(`\n=== 准备自动回复给: ${from} ===`);
        // 探照灯：检查系统肚子里有没有拿到钥匙
        console.log(`Token 状态: ${process.env.WHATSAPP_TOKEN ? "已加载 ✅" : "未加载 ❌"}`);
        console.log(`Phone ID 状态: ${process.env.WHATSAPP_PHONE_ID ? "已加载 ✅" : "未加载 ❌"}`);

        const phoneId = process.env.WHATSAPP_PHONE_ID;
        const token = process.env.WHATSAPP_TOKEN;

        if (!phoneId || !token) {
          console.error("❌ 致命错误: Vercel 环境变量里没有找到 WHATSAPP_PHONE_ID 或 WHATSAPP_TOKEN！");
          return NextResponse.json({ status: 'ok' }); // 依然返回 200 给 Meta，免得它一直重试
        }

        // 调用 Meta API 发射消息
        const response = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: from,
            text: { body: `🤖 叮！老板好，这里是 Factory OS 自动化中枢。已收到指令：『${text}』。系统运转正常！` }
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('❌ 发送失败！Meta 保安报错:', JSON.stringify(errorData, null, 2));
        } else {
          console.log('✅ 自动回复发送成功！蓝勾应该亮了！');
        }
      }
    }
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook 处理崩溃:', error);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}