/**
 * whatsapp-media.ts
 * Handles WhatsApp Cloud API media upload and document/message sending.
 *
 * Flow:
 *   1. POST PDF buffer → /media  → get media_id
 *   2. POST document message with media_id → customer
 *   3. POST text message confirming the order
 */

/** Upload a PDF buffer to WhatsApp Media API and return the media_id. */
async function uploadPdfToWhatsApp(
  pdfBuffer: Buffer,
  filename:  string,
): Promise<string> {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token   = process.env.WHATSAPP_TOKEN;
  if (!phoneId || !token) throw new Error('[WA Media] Missing WHATSAPP_PHONE_ID or WHATSAPP_TOKEN');

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' }), filename);
  form.append('type', 'application/pdf');
  form.append('messaging_product', 'whatsapp');

  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/media`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
    body:    form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[WA Media] Upload failed (${res.status}): ${err}`);
  }

  const json = await res.json() as { id: string };
  console.log('[WA Media] Uploaded, media_id:', json.id);
  return json.id;
}

/** Send a WhatsApp document (PDF) to a recipient using a media_id. */
async function sendWhatsAppDocument(
  to:        string,
  mediaId:   string,
  filename:  string,
  caption:   string,
): Promise<void> {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token   = process.env.WHATSAPP_TOKEN;
  if (!phoneId || !token) return;

  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: {
        id:       mediaId,
        filename,
        caption,
      },
    }),
  });

  if (!res.ok) console.error('[WA Media] sendDocument failed:', await res.text());
}

/** Send a plain text message via WhatsApp. */
async function sendWhatsAppText(to: string, text: string): Promise<void> {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token   = process.env.WHATSAPP_TOKEN;
  if (!phoneId || !token) return;

  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!res.ok) console.error('[WA Media] sendText failed:', await res.text());
}

/**
 * Main entry point: upload PDF and send document + confirmation text to customer.
 *
 * @param pdfBuffer  - Generated invoice PDF as Buffer
 * @param waId       - Recipient's WhatsApp ID (e.g. "60123456789")
 * @param invoiceNo  - Invoice number string (e.g. "INV-00042")
 */
export async function uploadAndSendInvoice(
  pdfBuffer: Buffer,
  waId:      string,
  invoiceNo: string,
): Promise<void> {
  const filename = `${invoiceNo}.pdf`;

  // 1. Upload PDF
  const mediaId = await uploadPdfToWhatsApp(pdfBuffer, filename);

  // 2. Send document with caption
  await sendWhatsAppDocument(
    waId,
    mediaId,
    filename,
    `📄 发票 ${invoiceNo}`,
  );

  // 3. Send confirmation text
  await sendWhatsAppText(
    waId,
    `✅ Boss，您的订单 ${invoiceNo} 已确认！\n发票已发送，货车准备出发了。\n谢谢惠顾！🙏`,
  );

  console.log(`[WA Media] ✅ Invoice ${invoiceNo} sent to ${waId}`);
}
