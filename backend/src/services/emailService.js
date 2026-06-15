import nodemailer from 'nodemailer';
import db from '../config/database.js';
import { env } from '../config/env.js';
import { formatDecimal } from '../utils/helpers.js';
import { generateReceiptPdf } from './receiptService.js';

// Lazily-created transporter so the SMTP connection is only opened the first
// time we actually send an email (and so unit tests can run without SMTP).
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!env.SMTP.host || !env.SMTP.user || !env.SMTP.pass) return null;
  transporter = nodemailer.createTransport({
    host: env.SMTP.host,
    port: env.SMTP.port,
    secure: env.SMTP.secure, // true for port 465
    auth: { user: env.SMTP.user, pass: env.SMTP.pass },
    // Avoid the 5-minute default socket timeout from hanging request handlers.
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transporter;
}

/**
 * Low-level send via SMTP (Zoho). Never throws — email problems must not
 * break the request that triggered them. One request per recipient so a
 * bad address doesn't drop the rest.
 */
export async function sendMail({ to, subject, text, html, category, attachments }) {
  const tx = getTransporter();
  if (!tx) {
    console.warn(`[email] skipped (SMTP not configured): "${subject}"`);
    return;
  }
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  for (const email of recipients) {
    try {
      const info = await tx.sendMail({
        from: { name: env.SMTP.fromName, address: env.SMTP.fromEmail },
        to: email,
        subject,
        text,
        html: html || text,
        ...(attachments?.length ? { attachments } : {}),
        headers: {
          'X-Mediacare-Category': category || 'MediCare Hub',
        },
      });
      console.log(
        `[email] sent "${subject}" -> ${email} (messageId=${info.messageId || 'n/a'})`,
      );
    } catch (err) {
      console.error(`[email] FAILED "${subject}" -> ${email}: ${err.message}`);
    }
  }
}

/** Wrap plain text in a minimal branded HTML layout. */
function layout(title, bodyLines) {
  const paragraphs = bodyLines
    .map((l) => `<p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.6">${l}</p>`)
    .join('');
  return `<!doctype html><html><body style="background:#f3f4f6;margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:#1B4F8C;padding:16px 24px"><span style="color:#fff;font-weight:700;font-size:16px">MediCare Hub</span></div>
      <div style="padding:24px">
        <h1 style="margin:0 0 16px;color:#111827;font-size:18px">${title}</h1>
        ${paragraphs}
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f3f4f6;color:#9ca3af;font-size:12px">
        MediCare Hub — B2B medical procurement, Tanzania
      </div>
    </div></body></html>`;
}

// --- recipient resolution -------------------------------------------------

function getOrderRow(orderId) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
}

function buyerContact(order) {
  return db.prepare('SELECT email, first_name FROM users WHERE id = ?').get(order.buyer_id);
}

function supplierContact(order) {
  return db
    .prepare(
      `SELECT u.email AS email, o.name AS org_name
       FROM suppliers s
       JOIN organisations o ON o.id = s.organisation_id
       LEFT JOIN users u ON u.organisation_id = s.organisation_id AND u.role = 'SUPPLIER'
       WHERE s.id = ?
       ORDER BY u.created_at
       LIMIT 1`,
    )
    .get(order.supplier_id);
}

function orderRef(order) {
  return order.id.slice(0, 8).toUpperCase();
}

function orderItemsText(orderId) {
  return db
    .prepare(
      `SELECT oi.quantity_ordered AS qty, p.name AS name
       FROM order_items oi JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`,
    )
    .all(orderId)
    .map((i) => `${i.name} × ${i.qty}`);
}

// --- auth emails ----------------------------------------------------------

export async function sendVerificationEmail(user, token) {
  if (!user?.email) return;
  const link = `${env.SMTP.appBaseUrl}/api/v1/auth/verify-email/${token}/`;
  await sendMail({
    to: user.email,
    subject: 'Verify your MediCare Hub email',
    category: 'Email Verification',
    text: `Hi ${user.first_name || ''},\n\nWelcome to MediCare Hub. Verify your email address by opening this link:\n\n${link}\n\nThis link expires in 24 hours. If you didn't create this account, you can ignore this email.`,
    html: layout('Confirm your email address', [
      `Hi ${user.first_name || 'there'},`,
      'Welcome to MediCare Hub. Please confirm your email address to activate your account.',
      `<div style="text-align:center;margin-top:8px"><a href="${link}" target="_blank" rel="noopener" style="display:inline-block;background:#1B4F8C;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px">Verify my email</a></div>`,
      `If the button doesn't work, copy this link:`,
      `<a href="${link}" target="_blank" rel="noopener" style="color:#1B4F8C;font-size:13px;word-break:break-all">${link}</a>`,
      `<span style="color:#9ca3af;font-size:12px">This link expires in 24 hours.</span>`,
    ]),
  });
}

export async function sendPasswordResetEmail(user, token) {
  if (!user?.email) return;
  await sendMail({
    to: user.email,
    subject: 'Reset your MediCare Hub password',
    category: 'Password Reset',
    text: `Hi ${user.first_name || ''},\n\nWe received a request to reset your password. Use this reset token (valid 24h):\n\n${token}\n\nIf you didn't request this, you can ignore this email.`,
    html: layout('Reset your password', [
      `Hi ${user.first_name || 'there'},`,
      'We received a request to reset your MediCare Hub password. Use the token below (valid for 24 hours):',
      `<code style="display:inline-block;background:#f3f4f6;padding:8px 12px;border-radius:6px;font-size:13px">${token}</code>`,
      "If you didn't request this, no action is needed.",
    ]),
  });
}

// --- order / payment emails ----------------------------------------------

export async function notifyOrderCreated(orderId) {
  const order = getOrderRow(orderId);
  if (!order) return;
  const buyer = buyerContact(order);
  const supplier = supplierContact(order);
  const ref = orderRef(order);
  const total = `TZS ${formatDecimal(order.total_amount)}`;
  const items = orderItemsText(order.id);
  const itemsHtml = items.map((i) => `&bull; ${i}`).join('<br>');

  if (buyer?.email) {
    await sendMail({
      to: buyer.email,
      subject: `Order ${ref} placed`,
      category: 'Order Created',
      text: `Hi ${buyer.first_name || ''},\n\nYour order ${ref} (${total}) has been placed with ${supplier?.org_name || 'the supplier'}.\n\n${items.map((i) => `- ${i}`).join('\n')}\n\nWe'll email you as it progresses.`,
      html: layout(`Order ${ref} placed`, [
        `Hi ${buyer.first_name || 'there'},`,
        `Your order has been placed with <strong>${supplier?.org_name || 'the supplier'}</strong>.`,
        itemsHtml,
        `<strong>Total: ${total}</strong>`,
        "We'll keep you posted as the supplier accepts and fulfils your order.",
      ]),
    });
  }

  if (supplier?.email) {
    await sendMail({
      to: supplier.email,
      subject: `New order ${ref} received`,
      category: 'Order Created',
      text: `You have received a new order ${ref} (${total}).\n\n${items.map((i) => `- ${i}`).join('\n')}\n\nLog in to accept and fulfil it.`,
      html: layout(`New order ${ref}`, [
        `You have received a new order (${total}).`,
        itemsHtml,
        'Log in to your supplier portal to accept and fulfil it.',
      ]),
    });
  }
}

export async function notifySupplierOrderCreated(orderId) {
  const order = getOrderRow(orderId);
  if (!order) return;
  const supplier = supplierContact(order);
  const ref = orderRef(order);
  const total = `TZS ${formatDecimal(order.total_amount)}`;
  const items = orderItemsText(order.id);
  const itemsHtml = items.map((i) => `&bull; ${i}`).join('<br>');

  if (supplier?.email) {
    await sendMail({
      to: supplier.email,
      subject: `New order ${ref} received`,
      category: 'Order Created',
      text: `You have received a new order ${ref} (${total}).\n\n${items.map((i) => `- ${i}`).join('\n')}\n\nLog in to accept and fulfil it.`,
      html: layout(`New order ${ref}`, [
        `You have received a new order (${total}).`,
        itemsHtml,
        'Log in to your supplier portal to accept and fulfil it.',
      ]),
    });
  }
}

export async function notifyBuyerGroupedOrderCreated(orderIds) {
  if (!orderIds.length) return;
  const orders = orderIds.map(getOrderRow).filter(Boolean);
  if (!orders.length) return;

  const buyer = buyerContact(orders[0]);
  if (!buyer?.email) return;

  const groupRef = (orders[0].checkout_group_id || orders[0].id).slice(0, 8).toUpperCase();
  const totalAmount = orders.reduce((sum, order) => sum + Number(order.total_amount), 0);
  const supplierLines = orders.map((order) => {
    const supplier = supplierContact(order);
    const items = orderItemsText(order.id).join(', ');
    return `${supplier?.org_name || 'Supplier'}: ${items}`;
  });

  await sendMail({
    to: buyer.email,
    subject: `Order ${groupRef} placed`,
    category: 'Order Created',
    text: `Hi ${buyer.first_name || ''},\n\nYour order ${groupRef} (TZS ${formatDecimal(totalAmount)}) has been placed with ${orders.length} supplier${orders.length === 1 ? '' : 's'}.\n\n${supplierLines.map((line) => `- ${line}`).join('\n')}\n\nWe'll email you as it progresses.`,
    html: layout(`Order ${groupRef} placed`, [
      `Hi ${buyer.first_name || 'there'},`,
      `Your order has been placed with <strong>${orders.length} supplier${orders.length === 1 ? '' : 's'}</strong>.`,
      supplierLines.map((line) => `&bull; ${line}`).join('<br>'),
      `<strong>Total: TZS ${formatDecimal(totalAmount)}</strong>`,
      "We'll keep you posted as suppliers accept and fulfil their parts of the order.",
    ]),
  });
}

const STATUS_MESSAGE = {
  ACCEPTED: (ref, sup) => `Your order ${ref} has been accepted by ${sup} and is being prepared.`,
  SHIPPED: (ref) => `Good news — your order ${ref} has been shipped and is on its way.`,
  DELIVERED: (ref) => `Your order ${ref} has been delivered. Please confirm receipt to complete it.`,
  COMPLETED: (ref) => `Your order ${ref} is now complete. Thank you for using MediCare Hub.`,
  REJECTED: (ref, sup) => `Unfortunately your order ${ref} was rejected by ${sup}.`,
};

export async function notifyOrderStatus(orderId, status) {
  const message = STATUS_MESSAGE[status];
  if (!message) return; // only notify on meaningful transitions
  const order = getOrderRow(orderId);
  if (!order) return;
  const buyer = buyerContact(order);
  const supplier = supplierContact(order);
  const ref = orderRef(order);
  const text = message(ref, supplier?.org_name || 'the supplier');

  if (buyer?.email) {
    await sendMail({
      to: buyer.email,
      subject: `Order ${ref}: ${status.toLowerCase()}`,
      category: 'Order Update',
      text: `Hi ${buyer.first_name || ''},\n\n${text}`,
      html: layout(`Order ${ref} update`, [`Hi ${buyer.first_name || 'there'},`, text]),
    });
  }

  // Let the supplier know once the buyer confirms completion.
  if (status === 'COMPLETED' && supplier?.email) {
    await sendMail({
      to: supplier.email,
      subject: `Order ${ref} completed`,
      category: 'Order Update',
      text: `Order ${ref} has been confirmed delivered and completed by the buyer.`,
      html: layout(`Order ${ref} completed`, [
        'The buyer has confirmed delivery and completed this order.',
      ]),
    });
  }
}

export async function notifyPaymentCompleted(orderId) {
  const order = getOrderRow(orderId);
  if (!order) return;
  const payment = db
    .prepare("SELECT * FROM payments WHERE order_id = ? AND status = 'COMPLETED' ORDER BY completed_at DESC LIMIT 1")
    .get(orderId);
  if (!payment) return;
  const buyer = buyerContact(order);
  const supplier = supplierContact(order);
  const ref = orderRef(order);
  const amount = `TZS ${formatDecimal(payment.amount)}`;

  const method = payment.gateway === 'card' ? 'card' : payment.gateway;
  const supplierName = supplier?.org_name || 'the supplier';

  // Generate the PDF receipt once and attach it to both emails.
  let attachments;
  try {
    const pdf = await generateReceiptPdf(order.id);
    if (pdf) {
      attachments = [{ filename: `receipt-${ref}.pdf`, content: pdf, contentType: 'application/pdf' }];
    }
  } catch (err) {
    console.error(`[email] receipt PDF failed for order ${ref}: ${err.message}`);
  }

  if (buyer?.email) {
    await sendMail({
      to: buyer.email,
      subject: `Payment received — order ${ref} is now being processed`,
      category: 'Payment',
      text: `Hi ${buyer.first_name || ''},\n\nWe've received your payment of ${amount} for order ${ref} (paid by ${method}).\nTransaction reference: ${payment.transaction_reference}\n\nYour order is now being processed by ${supplierName} and will be prepared and shipped. We'll email you as it progresses.\n\nThank you.`,
      html: layout('Payment received — order in process', [
        `Hi ${buyer.first_name || 'there'},`,
        `We've received your payment of <strong>${amount}</strong> for order <strong>${ref}</strong> (paid by ${method}).`,
        `Your order is now <strong>being processed</strong> by ${supplierName} — it will be prepared and shipped, and we'll keep you updated.`,
        `Transaction reference: <span style="color:#6b7280">${payment.transaction_reference}</span>`,
        'Your receipt is attached to this email.',
        'Thank you for your payment.',
      ]),
      attachments,
    });
  }

  if (supplier?.email) {
    await sendMail({
      to: supplier.email,
      subject: `Payment received for order ${ref} — please process`,
      category: 'Payment',
      text: `Payment of ${amount} has been received for order ${ref} (paid by ${method}).\n\nThe order is now in process — please prepare and ship it. Log in to your supplier portal to update its status.`,
      html: layout('Payment received — please process the order', [
        `Payment of <strong>${amount}</strong> has been received for order <strong>${ref}</strong> (paid by ${method}).`,
        'The order is now <strong>in process</strong> — please prepare and ship it.',
        'Log in to your supplier portal to update the order status. A copy of the receipt is attached.',
      ]),
      attachments,
    });
  }
}
