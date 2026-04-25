import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { markRead, sendWhatsApp } from '@/services/whatsapp';
import {
  getSupabase,
  fetchOrCreateCustomer,
  fetchHistory,
  saveMessage,
  fetchPricingFromDB,
  formatPricingBlock,
  saveOrder
} from '@/services/database';
import { chatWithAI } from '@/services/ai';

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const change = body.entry?.[0]?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    // Ignore status callbacks & non-text messages
    if (!message || message.type !== 'text') {
      return NextResponse.json({ status: 'ok' });
    }

    const from: string = message.from;
    const text: string = message.text.body;
    const messageId: string = message.id;
    const waName: string = change?.contacts?.[0]?.profile?.name ?? 'Boss';

    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const token = process.env.WHATSAPP_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!phoneId || !token) {
      console.error('[Config] 缺少 WHATSAPP_PHONE_ID / WHATSAPP_TOKEN');
      return NextResponse.json({ status: 'ok' });
    }

    console.log(`[MSG] ${from} (${waName}): "${text}"`);

    // Use `after` to process the heavy logic in the background, 
    // ensuring WhatsApp webhook receives a 200 OK immediately to prevent timeouts and retries.
    after(async () => {
      try {
        // ① Mark as read
        await markRead(phoneId, token, messageId);

        const sb = getSupabase();
        let isNew = false;
        let totalSpent = 0;
        let history: any[] = [];
        let pricingBlock = '（产品报价加载失败，请联系 Max Boss 确认）';

        // ② Fetch Context
        if (sb) {
          const [custResult, hist, products] = await Promise.all([
            fetchOrCreateCustomer(sb, from, waName),
            fetchHistory(sb, from, 25),
            fetchPricingFromDB(sb),
          ]);

          isNew = custResult.isNew;
          totalSpent = custResult.customer.total_spent ?? 0;
          history = hist;
          pricingBlock = formatPricingBlock(products);

          console.log(`[DB] ${from} | 新:${isNew} | RM${totalSpent} | 历史:${history.length}条 | 产品:${products.length}款`);
          
          // Save the incoming user message
          await saveMessage(sb, from, 'user', text);
        }

        // ③ AI Processing (using Function Calling)
        let replyText = '';
        let autoOrder = null;

        if (!geminiKey) {
          replyText = '您好 Boss！系统维护中，请稍后联系。Pek Laju 感谢您！';
        } else {
          const aiResult = await chatWithAI(geminiKey, waName, isNew, totalSpent, pricingBlock, history, text);
          replyText = aiResult.replyText;
          autoOrder = aiResult.autoOrder;
          
          if (autoOrder) {
            console.log('[AI] 通过 Function Calling 检测到订单:', JSON.stringify(autoOrder));
          }
        }

        // ④ Send WhatsApp Reply
        await sendWhatsApp(phoneId, token, from, replyText);
        console.log(`[WA] 已回复 ${from}: "${replyText.substring(0, 120)}"`);

        // ⑤ Save AI reply to DB
        if (sb) {
          await saveMessage(sb, from, 'model', replyText);
        }

        // ⑥ Write order to DB if generated
        if (sb && autoOrder) {
          try {
            await saveOrder(sb, from, autoOrder);
            console.log(`[DB] ✅ 订单已记录 RM${autoOrder.total_price} | ${autoOrder.items.length}项`);
          } catch (error: any) {
            console.error('[DB] 订单写入失败:', error.message);
            await sendWhatsApp(phoneId, token, from, `\n[系统报警] 订单未能存入系统 (请截图给老板): ${error.message}`);
          }
        }

      } catch (err: any) {
        console.error('[Background] 处理失败:', err);
        if (phoneId && token) {
          // 发送给 Boss
          await sendWhatsApp(phoneId, token, '60102328335', `🚨 [系统最高警报] 后台处理崩溃，请立即检查 Vercel 日志！\n错误信息: ${err.message}`);
        }
      }
    });

    // 10ms Return OK to WhatsApp
    return NextResponse.json({ status: 'ok' });

  } catch (err) {
    console.error('[Webhook] 未捕获异常:', err);
    return NextResponse.json({ status: 'error_handled' }, { status: 200 });
  }
}