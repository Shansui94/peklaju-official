import { NextResponse } from 'next/server';
import { getSupabase, fetchOrCreateCustomer, fetchHistory, saveMessage, fetchPricingFromDB, formatPricingBlock, saveOrder } from '@/services/database';
import { chatWithAI } from '@/services/ai';

export async function POST(request: Request) {
  try {
    const { text, customerId, customerName = 'Web Boss' } = await request.json();

    if (!text || !customerId) {
      return NextResponse.json({ error: 'Missing text or customerId' }, { status: 400 });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return NextResponse.json({ error: 'System Maintenance' }, { status: 503 });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });

    // 1. 获取上下文（与 WhatsApp 共享同一个大脑）
    const [custResult, history, products] = await Promise.all([
      fetchOrCreateCustomer(sb, customerId, customerName),
      fetchHistory(sb, customerId, 25),
      fetchPricingFromDB(sb),
    ]);

    const isNew = custResult.isNew;
    const totalSpent = custResult.customer.total_spent ?? 0;
    const pricingBlock = formatPricingBlock(products);

    // 2. 保存用户消息
    await saveMessage(sb, customerId, 'user', text);

    // 3. 调用统一的 AI 服务
    const { replyText, autoOrder } = await chatWithAI(
      geminiKey, customerName, isNew, totalSpent, pricingBlock, history, text
    );

    // 4. 保存 AI 回复
    await saveMessage(sb, customerId, 'model', replyText);

    // 5. 如果生成了订单，写入数据库
    if (autoOrder) {
      await saveOrder(sb, customerId, autoOrder);
    }

    // 6. 直接将结果返回给网页前端
    return NextResponse.json({
      reply: replyText,
      orderGenerated: !!autoOrder,
      orderData: autoOrder || null
    });

  } catch (err: any) {
    console.error('[WebChat] 错误:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
