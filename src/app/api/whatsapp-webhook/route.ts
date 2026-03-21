import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // 提取 Meta 的安全验证参数
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const VERIFY_TOKEN = 'peklaju_2026_webhook';

  // 验证模式和 token 是否正确
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WhatsApp Webhook Verified Successfully!');
    // 验证通过，必须返回纯文本格式的 hub.challenge
    return new NextResponse(challenge, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }

  // 验证失败，返回 403 状态码
  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(request: Request) {
  try {
    // 解析 Meta 发送过来的 JSON 数据包
    const body = await request.json();
    
    // 把客户发来的消息体打印在控制台
    console.log('\n--- 新的 WhatsApp 消息 ---');
    console.log(JSON.stringify(body, null, 2));
    console.log('--------------------------\n');

    // 必须返回 200 OK，告诉 Meta 消息已签收
    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('解析 Webhook 数据包失败:', error);
    // 依然返回 200 避免 Meta 继续重试发送无效请求
    return new NextResponse('OK', { status: 200 });
  }
}
