export async function markRead(phoneId: string, token: string, msgId: string) {
  await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: msgId }),
  }).catch(console.error);
}

export async function sendWhatsApp(phoneId: string, token: string, to: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, text: { body: text } }),
  });
  if (!res.ok) console.error('[WA] 发送失败:', await res.text());
}
