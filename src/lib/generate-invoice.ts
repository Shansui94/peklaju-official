/**
 * generate-invoice.ts
 * Server-side PDF invoice generator using pdfkit (Node.js native, no browser needed).
 */

import PDFDocument from 'pdfkit';

export interface InvoiceOrder {
  id:          number;
  customer_id: string;   // wa_id e.g. "60123456789"
  items: {
    product:    string;
    qty:        number;
    unit_price: number;
    subtotal:   number;
  }[];
  total_price: number;
  notes:       string | null;
  created_at:  string;
}

/** Generates a PDF invoice and returns it as a Buffer. */
export function generateInvoicePDF(order: InvoiceOrder): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size:   'A4',
      margin: 0,
      info: {
        Title:  `Invoice INV-${String(order.id).padStart(5, '0')}`,
        Author: 'Pek Laju Trading',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data',  (c: Buffer) => chunks.push(c));
    doc.on('end',   ()          => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W   = doc.page.width;   // 595.28
    const INV = `INV-${String(order.id).padStart(5, '0')}`;
    const dateStr = new Date(order.created_at).toLocaleDateString('en-MY', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur',
    });

    // ── Dark header bar ──────────────────────────────────────────────────────
    doc.rect(0, 0, W, 110).fill('#0f172a');

    // Company name
    doc.fillColor('#22d3ee').font('Helvetica-Bold').fontSize(20)
       .text('PEK LAJU TRADING', 50, 28);

    // Company details
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
       .text('SSM: 202503138032 (PG0571705-H)', 50, 56)
       .text('30, LRG JAYA 10, TMN AOR JAYA, 34000 TAIPING, PERAK', 50, 68)
       .text('Tel / WA: 012-994 0514', 50, 80);

    // Invoice label (right-aligned in header)
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(26)
       .text('INVOICE', 0, 26, { align: 'right', width: W - 50 });

    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
       .text(`No: ${INV}`, 0, 64, { align: 'right', width: W - 50 })
       .text(`Date: ${dateStr}`, 0, 76, { align: 'right', width: W - 50 });

    // ── Bill To ──────────────────────────────────────────────────────────────
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8)
       .text('BILL TO', 50, 128);

    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(11)
       .text(`WhatsApp: +${order.customer_id}`, 50, 142);

    if (order.notes) {
      doc.fillColor('#475569').font('Helvetica').fontSize(9)
         .text(`Delivery / Penghantaran:`, 50, 160)
         .text(order.notes, 50, 173, { width: W - 100 });
    }

    // ── Items table ───────────────────────────────────────────────────────────
    const tableTop = 215;
    const COL = { desc: 50, qty: 320, unit: 390, sub: 470 };
    const ROW_H = 26;

    // Table header
    doc.rect(50, tableTop, W - 100, 24).fill('#0f172a');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
    doc.text('DESCRIPTION',   COL.desc + 6,  tableTop + 8);
    doc.text('QTY',           COL.qty,        tableTop + 8, { width: 60, align: 'center' });
    doc.text('UNIT PRICE',    COL.unit,       tableTop + 8, { width: 70, align: 'right' });
    doc.text('SUBTOTAL',      COL.sub,        tableTop + 8, { width: 65, align: 'right' });

    // Item rows
    let rowY = tableTop + 24;
    order.items.forEach((item, idx) => {
      const bg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
      doc.rect(50, rowY, W - 100, ROW_H).fill(bg);

      doc.fillColor('#1e293b').font('Helvetica').fontSize(9);
      doc.text(item.product,                         COL.desc + 6, rowY + 9, { width: 255 });
      doc.text(String(item.qty),                     COL.qty,       rowY + 9, { width: 60,  align: 'center' });
      doc.text(`RM ${Number(item.unit_price).toFixed(2)}`, COL.unit, rowY + 9, { width: 70,  align: 'right'  });
      doc.text(`RM ${Number(item.subtotal  ).toFixed(2)}`, COL.sub,  rowY + 9, { width: 65,  align: 'right'  });

      rowY += ROW_H;
    });

    // Total row
    doc.rect(50, rowY, W - 100, 32).fill('#0f172a');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12)
       .text('TOTAL',                                           COL.desc + 6, rowY + 10)
       .text(`RM ${Number(order.total_price).toFixed(2)}`,      COL.sub,       rowY + 10, { width: 65, align: 'right' });

    // ── Payment note ─────────────────────────────────────────────────────────
    const noteY = rowY + 48;
    doc.rect(50, noteY, W - 100, 40).fill('#f0fdf4');
    doc.fillColor('#166534').font('Helvetica-Bold').fontSize(8.5)
       .text('Payment / Pembayaran:', 62, noteY + 8);
    doc.fillColor('#15803d').font('Helvetica').fontSize(8.5)
       .text('Bank Transfer / TnG / DuitNow — 012-994 0514 (Max Tan)', 62, noteY + 22);

    // ── Footer ───────────────────────────────────────────────────────────────
    const footerY = noteY + 60;
    doc.moveTo(50, footerY).lineTo(W - 50, footerY).strokeColor('#e2e8f0').stroke();

    doc.fillColor('#94a3b8').font('Helvetica').fontSize(7.5)
       .text(
         'Thank you for your business!  ·  Terima kasih atas sokongan anda!\n' +
         'No return or exchange after delivery.  /  Tiada pulangan selepas penghantaran.',
         50, footerY + 10,
         { align: 'center', width: W - 100 },
       );

    doc.end();
  });
}
