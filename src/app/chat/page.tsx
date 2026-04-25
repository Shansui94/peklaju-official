'use client';

import React, { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
}

export default function WebChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'ai', text: 'Boss 你好！我是 Pek Laju 的智能销售助理。想要看看我们的塑料包装膜或者气泡膜吗？' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // 随机生成一个网页端用户ID，模拟一个客户
  const [customerId] = useState(() => 'WEB_USER_' + Math.random().toString(36).substr(2, 9));

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMessage: Message = { id: Date.now().toString(), role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/web-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: userMessage.text,
          customerId: customerId,
          customerName: '网页端客户'
        })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const aiMessage: Message = { 
        id: (Date.now() + 1).toString(), 
        role: 'ai', 
        text: data.reply || '（系统默认）订单已记录发给老板了！' 
      };
      
      setMessages(prev => [...prev, aiMessage]);

      // 选做：如果在网页里生成了订单，可以在这里给个额外的弹窗动画
      if (data.orderGenerated) {
        console.log("💰 网页端触发了下单！", data.orderData);
        setMessages(prev => [...prev, {
          id: Date.now().toString() + '_debug',
          role: 'ai',
          text: `[系统调试] ✅ AI 成功调用了 create_order 工具！订单总价: RM${data.orderData.total_price}。如果后台没看到，说明数据库触发器把它吃掉了！`
        }]);
      } else if (aiMessage.text.includes('发给 Max 处理了') && !data.orderGenerated) {
        setMessages(prev => [...prev, {
          id: Date.now().toString() + '_debug',
          role: 'ai',
          text: `[系统调试] 🚨 AI 幻觉警告：AI 输出了结单的话语，但它【没有】触发订单工具！`
        }]);
      }

    } catch (error: any) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'ai', 
        text: '❌ 哎呀，网络开小差了，请重试！' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-8 font-sans">
      
      {/* 炫酷背景光晕 */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/30 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/30 blur-[120px] rounded-full pointer-events-none"></div>

      {/* 玻璃拟态聊天容器 */}
      <div className="relative w-full max-w-2xl h-[85vh] bg-slate-900/50 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden flex flex-col z-10 transition-all duration-500 hover:shadow-blue-900/20">
        
        {/* 顶部 Header */}
        <div className="h-20 bg-gradient-to-r from-blue-900/80 to-purple-900/80 border-b border-slate-700/50 flex items-center px-6 shrink-0">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-400 to-emerald-400 p-[2px] shadow-lg shadow-blue-500/30">
            <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center font-bold text-white text-xl">
              PL
            </div>
          </div>
          <div className="ml-4 flex flex-col">
            <span className="text-white font-bold text-lg tracking-wide">Pek Laju AI Agent</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-emerald-400/80 text-xs font-medium">Online (Web Session)</span>
            </div>
          </div>
        </div>

        {/* 聊天消息区 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[80%] px-5 py-4 rounded-2xl text-sm md:text-base leading-relaxed shadow-md
                ${msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-sm' 
                  : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-sm'
                }`}
                style={{ wordBreak: 'break-word' }}
              >
                {msg.text.split('\n').map((line, i) => (
                  <React.Fragment key={i}>
                    {line}
                    {i !== msg.text.split('\n').length - 1 && <br />}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}

          {/* 打字 Loading 状态 */}
          {isLoading && (
            <div className="flex w-full justify-start">
              <div className="bg-slate-800 border border-slate-700 px-5 py-4 rounded-2xl rounded-tl-sm shadow-md flex gap-2 items-center">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 底部输入框 */}
        <div className="p-4 bg-slate-900/80 border-t border-slate-700/50 shrink-0">
          <form 
            onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
            className="flex gap-3 max-w-full"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="问问价格，或者直接告诉老板收货地址..."
              disabled={isLoading}
              className="flex-1 bg-slate-800/80 border border-slate-600/50 rounded-xl px-5 py-4 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 hover:from-blue-500 hover:to-indigo-500 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[100px]"
            >
              {isLoading ? '发送中' : '发送'}
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}
