import { MessageRow } from './database';

export interface OrderItem {
  product: string;
  qty: number;
  unit_price: number;
  subtotal: number;
}

export interface AutoOrder {
  items: OrderItem[];
  total_price: number;
  notes?: string;
}

export interface AIResult {
  replyText: string;
  autoOrder: AutoOrder | null;
}

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
2. 只要客户发了【收货地址】（比如包含 Lorong, Taiping, Taman, Jalan 或任何门牌号），即使他没有在这一句话里写明要买什么，你也必须【强制、立刻】去上文对话找出产品和数量，并【强制调用 \`create_order\` 工具】！
3. 绝对、绝对、绝对不要在客户发送地址后，反问“你需要什么产品和数量？”！如果你这么问，系统会立刻崩溃！你必须自己去上文找！
4. 没发地址的时候：他问价你报价，他确认数量你算总价并问"Boss要送去哪里？"。只要你问了送去哪里，他接着回答的就算地址，立刻调用工具结单！
5. 客户在结单后的闲聊：简单回答：“没问题Boss，Max老板随后会处理好的！”。**绝不允许因为闲聊就重新问客户要买什么材料！**`;
}

export async function chatWithAI(
  geminiKey: string,
  waName: string,
  isNew: boolean,
  totalSpent: number,
  pricingBlock: string,
  history: MessageRow[],
  currentText: string
): Promise<AIResult> {
  const systemInstruction = buildSystemInstruction(waName, isNew, totalSpent, pricingBlock);

  const contents = [
    ...history.map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: currentText }] },
  ];

  const tools = [{
    functionDeclarations: [{
      name: "create_order",
      description: "【最高优先级工具】只要你从用户刚刚的回复中，看到了任何地理位置词（如 Taiping, Lorong 等地址），必须立刻强制调用本工具生成订单！自己去上文寻找 product 和 qty，绝对不准用文字反问客户！",
      parameters: {
        type: "OBJECT",
        properties: {
          replyToCustomer: { 
            type: "STRING", 
            description: "你要发给客户的文字回复，例如：Boss，地址收到，单子已录入发给 Max 处理了。" 
          },
          items: {
            type: "ARRAY",
            description: "客户订购的商品列表",
            items: {
              type: "OBJECT",
              properties: {
                product: { type: "STRING", description: "提取客户要求的真实商品名" },
                qty: { type: "NUMBER", description: "数量" },
                unit_price: { type: "NUMBER", description: "单价" },
                subtotal: { type: "NUMBER", description: "小计" }
              },
              required: ["product", "qty", "unit_price", "subtotal"]
            }
          },
          total_price: { type: "NUMBER", description: "订单总价" },
          delivery_address: { type: "STRING", description: "客户提供的收货地址，将原样作为订单备注" }
        },
        required: ["replyToCustomer", "items", "total_price", "delivery_address"]
      }
    }]
  }];

  const aiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        tools,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 800,
        },
      }),
    }
  );

  const aiJson = await aiRes.json();
  
  if (!aiRes.ok) {
    const errorMsg = aiJson.error?.message || JSON.stringify(aiJson);
    console.error('[Gemini API Error]', errorMsg);
    throw new Error(`Gemini API 拒绝了请求: ${errorMsg}`);
  }

  const parts = aiJson.candidates?.[0]?.content?.parts || [];
  
  if (parts.length === 0) {
    const finishReason = aiJson.candidates?.[0]?.finishReason || '未知';
    console.warn('[Gemini Empty Response] Finish Reason:', finishReason);
    throw new Error(`AI 未返回任何内容 (结束原因: ${finishReason})`);
  }
  
  let replyText = '';
  let autoOrder: AutoOrder | null = null;

  for (const part of parts) {
    if (part.text) {
      replyText += part.text;
    }
    if (part.functionCall && part.functionCall.name === 'create_order') {
      const args = part.functionCall.args;
      if (args.replyToCustomer) {
        replyText = args.replyToCustomer; // Override text with the structured reply
      }
      autoOrder = {
        items: args.items || [],
        total_price: args.total_price || 0,
        notes: args.delivery_address || ''
      };
    }
  }

  // 兜底回复
  if (autoOrder && !replyText) {
    replyText = "Boss，地址收到，单子已录入发给 Max 处理了。";
  }

  return {
    replyText: replyText.trim() || '[系统警告] AI 没有生成文本回复，但也没有触发报错。',
    autoOrder
  };
}
