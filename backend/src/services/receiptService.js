import PDFDocument from 'pdfkit';
import db from '../config/database.js';
import { formatDecimal } from '../utils/helpers.js';

function fetchReceiptData(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  const org = db.prepare('SELECT name FROM organisations WHERE id = ?').get(order.organisation_id);
  const supplier = db
    .prepare(
      `SELECT o.name AS name FROM suppliers s JOIN organisations o ON o.id = s.organisation_id WHERE s.id = ?`,
    )
    .get(order.supplier_id);
  const items = db
    .prepare(
      `SELECT oi.quantity_ordered AS qty, oi.unit_price AS unit, oi.subtotal AS sub, p.name AS name
       FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`,
    )
    .all(orderId);
  const payment = db
    .prepare("SELECT * FROM payments WHERE order_id = ? AND status = 'COMPLETED' ORDER BY completed_at DESC LIMIT 1")
    .get(orderId);
  return { order, orgName: org?.name || '—', supplierName: supplier?.name || '—', items, payment };
}

/** Build a PDF payment receipt for an order and resolve to a Buffer. */
export function generateReceiptPdf(orderId) {
  const data = fetchReceiptData(orderId);
  if (!data || !data.payment) return Promise.resolve(null);

  const { order, orgName, supplierName, items, payment } = data;
  const ref = order.id.slice(0, 8).toUpperCase();
  const cur = order.currency || 'TZS';
  const money = (v) => `${cur} ${formatDecimal(v)}`;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fillColor('#1B4F8C').font('Helvetica-Bold').fontSize(22).text('MediCare Hub');
      doc.fillColor('#6b7280').font('Helvetica').fontSize(10).text('B2B Medical Procurement — Tanzania');
      doc.moveDown(0.8);
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(16).text('Payment Receipt');
      doc.moveDown(0.6);

      // Meta
      doc.font('Helvetica').fontSize(10).fillColor('#374151');
      doc.text(`Order: #${ref}`);
      doc.text(`Date paid: ${new Date(payment.completed_at || Date.now()).toLocaleString('en-GB')}`);
      doc.text('Status: PAID');
      doc.moveDown(0.5);
      doc.text(`Billed to: ${orgName}`);
      doc.text(`Supplier: ${supplierName}`);
      doc.moveDown(1);

      // Items
      doc.font('Helvetica-Bold').fillColor('#111827').text('Items');
      doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#e5e7eb').stroke();
      doc.moveDown(0.4);
      doc.font('Helvetica').fillColor('#374151');
      for (const it of items) {
        doc.text(`• ${it.name} — ${it.qty} × ${cur} ${formatDecimal(it.unit)} = ${cur} ${formatDecimal(it.sub)}`);
      }
      doc.moveDown(0.8);

      // Totals
      doc.font('Helvetica').fillColor('#374151');
      doc.text(`Subtotal: ${money(order.subtotal)}`);
      if (Number(order.delivery_fee) > 0) doc.text(`Delivery fee: ${money(order.delivery_fee)}`);
      if (Number(order.tax_amount) > 0) doc.text(`Tax: ${money(order.tax_amount)}`);
      doc.font('Helvetica-Bold').fillColor('#111827').fontSize(12).text(`Total paid: ${money(order.total_amount)}`);
      doc.moveDown(1);

      // Payment details
      const method = payment.gateway === 'card' ? 'Card (Stripe)' : payment.gateway;
      doc.font('Helvetica').fillColor('#374151').fontSize(10);
      doc.text(`Payment method: ${method}`);
      doc.text(`Transaction reference: ${payment.transaction_reference || '—'}`);
      doc.moveDown(2);
      doc.fillColor('#9ca3af').fontSize(9).text(
        'Thank you for your business. This is a system-generated receipt from MediCare Hub.',
        { align: 'center' },
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
