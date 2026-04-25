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
2. 只要客户发了【收货地址】（比如包含 Lorong, Taiping, Taman, Jalan 等字眼的地址），不要犹豫，绝对不要问“你需要什么产品”！直接从上文找他刚才买的产品和数量，立刻调用 \`create_order\` 工具结单！
3. 如果你调用了 \`create_order\` 工具，系统会自动帮客户下单，你的文字回复（replyToCustomer）必须极简，例如：“Boss，地址收到，单子已录入发给 Max 处理了。”
4. 没发地址的时候：
- 他只问价，你报价，并问"要多少？"。
- 他确认了数量，你算总价，并问"Boss要送去哪里？"。
- 凡是你问了"送去哪里"，只要客户接着回答的哪怕只言片语，都当做地址！立刻调用 \`create_order\` 工具！
5. 客户在结单后的闲聊：只要你之前已经下过单，客户如果随后追问发货时间等，简单回答：“没问题Boss，Max老板随后会处理好的！”。**绝不允许因为闲聊就重新问客户要买什么材料！**`;
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
      description: "当且仅当客户确认了商品、数量，并提供了收货地址时，调用此功能创建订单。如果调用此功能，你仍然可以（也必须）提供简短的 replyToCustomer 文字回复。",
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
  const parts = aiJson.candidates?.[0]?.content?.parts || [];
  
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
    replyText: replyText.trim() || '系统正在处理您的请求，请稍候...',
    autoOrder
  };
}
