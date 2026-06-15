import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPathRaw = process.env.DATABASE_URL || './data/medicare_hub.sqlite';
const dbPath = path.isAbsolute(dbPathRaw) ? dbPathRaw : path.resolve(__dirname, '../../', dbPathRaw);

// Ensure data directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable foreign keys and WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;

export function initDatabase() {
  db.exec(`
    -- Core organisations
    CREATE TABLE IF NOT EXISTS organisations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('HOSPITAL','SUPPLIER','PHARMACY','LAB')),
      registration_number TEXT,
      tmda_license TEXT,
      is_verified INTEGER NOT NULL DEFAULT 0,
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Users
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('HOSPITAL','SUPPLIER','ADMIN')),
      organisation_id TEXT REFERENCES organisations(id) ON DELETE SET NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_verified INTEGER NOT NULL DEFAULT 0,
      is_staff INTEGER NOT NULL DEFAULT 0,
      mfa_enabled INTEGER NOT NULL DEFAULT 0,
      last_login_ip TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_organisation ON users(organisation_id);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

    -- User sessions
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_token TEXT UNIQUE NOT NULL,
      ip_address TEXT,
      device_info TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
    );

    -- Auth tokens (email verification / password reset)
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      token_type TEXT NOT NULL CHECK(token_type IN ('EMAIL_VERIFICATION','PASSWORD_RESET')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );

    -- Audit logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      ip_address TEXT,
      user_agent TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Supplier profiles
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      organisation_id TEXT NOT NULL UNIQUE REFERENCES organisations(id) ON DELETE CASCADE,
      brela_registration_number TEXT,
      tmda_license_number TEXT,
      license_expiry_date TEXT,
      trust_score INTEGER NOT NULL DEFAULT 0 CHECK(trust_score BETWEEN 0 AND 100),
      average_delivery_days REAL DEFAULT 7,
      is_cold_chain_certified INTEGER NOT NULL DEFAULT 0,
      cold_chain_cert_expiry TEXT,
      verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(verification_status IN ('PENDING','VERIFIED','REJECTED','SUSPENDED')),
      verified_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      verified_at TEXT,
      rejection_reason TEXT,
      suspension_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_suppliers_org ON suppliers(organisation_id);
    CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(verification_status);

    -- Supplier documents
    CREATE TABLE IF NOT EXISTS supplier_documents (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL CHECK(document_type IN ('business_cert','tmda_license','tax_clearance')),
      file_path TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(supplier_id, document_type)
    );

    -- Categories
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      is_regulated INTEGER NOT NULL DEFAULT 0,
      tmda_required INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

    -- Products
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      generic_name TEXT,
      gtin TEXT,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      description TEXT,
      unit_of_measure TEXT NOT NULL DEFAULT 'unit',
      price REAL NOT NULL CHECK(price >= 0),
      currency TEXT NOT NULL DEFAULT 'TZS',
      minimum_order_quantity INTEGER NOT NULL DEFAULT 1 CHECK(minimum_order_quantity >= 1),
      is_cold_chain_required INTEGER NOT NULL DEFAULT 0,
      temperature_range_min REAL,
      temperature_range_max REAL,
      tmda_registration_number TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      image_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
    CREATE INDEX IF NOT EXISTS idx_products_search ON products(name, generic_name);

    -- Product images
    CREATE TABLE IF NOT EXISTS product_images (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);

    -- Product batches / inventory
    CREATE TABLE IF NOT EXISTS product_batches (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      batch_number TEXT NOT NULL UNIQUE,
      manufacture_date TEXT,
      expiry_date TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
      reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK(reserved_quantity >= 0),
      unit_cost REAL,
      storage_conditions TEXT,
      tmda_batch_cert_number TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_batches_product ON product_batches(product_id);
    CREATE INDEX IF NOT EXISTS idx_batches_supplier ON product_batches(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_batches_expiry ON product_batches(expiry_date);

    -- Orders
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REJECTED','APPROVED','CONFIRMED','PAID','PREPARING','PROCESSING','SHIPPED','DELIVERED','COMPLETED','CANCELLED','DISPUTED')),
      subtotal REAL NOT NULL DEFAULT 0,
      delivery_fee REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'TZS',
      lpo_number TEXT,
      payment_terms TEXT NOT NULL DEFAULT 'IMMEDIATE' CHECK(payment_terms IN ('IMMEDIATE','NET30','NET60','NET90')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_org ON orders(organisation_id);
    CREATE INDEX IF NOT EXISTS idx_orders_supplier ON orders(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

    -- Order items
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      batch_id TEXT REFERENCES product_batches(id) ON DELETE SET NULL,
      quantity_ordered INTEGER NOT NULL DEFAULT 1,
      quantity_delivered INTEGER NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL,
      subtotal REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

    -- Approval steps
    CREATE TABLE IF NOT EXISTS approval_steps (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      step_number INTEGER NOT NULL,
      required_role TEXT NOT NULL,
      approver_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
      approved_at TEXT,
      rejection_reason TEXT,
      threshold_amount REAL NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_approval_steps_order ON approval_steps(order_id);

    -- Order status history
    CREATE TABLE IF NOT EXISTS order_status_history (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id);

    -- Batch reservations
    CREATE TABLE IF NOT EXISTS batch_reservations (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_item_id TEXT REFERENCES order_items(id) ON DELETE CASCADE,
      batch_id TEXT NOT NULL REFERENCES product_batches(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 0,
      is_released INTEGER NOT NULL DEFAULT 0,
      is_fulfilled INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_reservations_order ON batch_reservations(order_id);
    CREATE INDEX IF NOT EXISTS idx_reservations_batch ON batch_reservations(batch_id);

    -- Goods received notes
    CREATE TABLE IF NOT EXISTS goods_received_notes (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
      received_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      received_at TEXT,
      items_verified TEXT,
      discrepancies TEXT,
      photos TEXT,
      signature_data TEXT,
      is_complete INTEGER NOT NULL DEFAULT 0
    );

    -- Payments
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
      gateway TEXT NOT NULL CHECK(gateway IN ('mpesa','selcom','airtel','bank_transfer','card')),
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'TZS',
      transaction_reference TEXT NOT NULL UNIQUE,
      gateway_reference TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','COMPLETED','FAILED','REFUNDED')),
      gateway_response TEXT,
      initiated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

    -- Webhook logs
    CREATE TABLE IF NOT EXISTS webhook_logs (
      id TEXT PRIMARY KEY,
      gateway TEXT NOT NULL,
      raw_payload TEXT NOT NULL,
      headers TEXT,
      signature TEXT,
      ip_address TEXT,
      signature_verified INTEGER NOT NULL DEFAULT 0,
      processing_status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK(processing_status IN ('RECEIVED','VERIFIED','PROCESSED','FAILED','REJECTED')),
      processing_error TEXT,
      payment_id TEXT REFERENCES payments(id) ON DELETE SET NULL,
      received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TEXT
    );

    -- Escrow accounts
    CREATE TABLE IF NOT EXISTS escrow_accounts (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
      payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
      amount_held REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'HOLDING' CHECK(status IN ('HOLDING','RELEASED','REFUNDED','FROZEN')),
      release_trigger TEXT,
      held_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      released_at TEXT,
      dispute_reason TEXT
    );

    -- Payout transactions
    CREATE TABLE IF NOT EXISTS payout_transactions (
      id TEXT PRIMARY KEY,
      escrow_account_id TEXT NOT NULL REFERENCES escrow_accounts(id) ON DELETE RESTRICT,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'TZS',
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','COMPLETED','FAILED')),
      gateway_reference TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );

    -- Notifications (stub table)
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'EMAIL',
      status TEXT NOT NULL DEFAULT 'PENDING',
      metadata TEXT,
      sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Price history / analytics
    CREATE TABLE IF NOT EXISTS price_history (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      price REAL NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: add products.image_url if it doesn't already exist (idempotent)
  const imageUrlColumn = db.prepare(`
    SELECT COUNT(*) AS count FROM pragma_table_info('products') WHERE name = ?
  `).get('image_url');
  if (!imageUrlColumn || imageUrlColumn.count === 0) {
    db.exec(`ALTER TABLE products ADD COLUMN image_url TEXT;`);
  }

  // Migration: add supplier NIDA / KYC columns (idempotent)
  for (const col of ['nida_number', 'kyc_status']) {
    const exists = db.prepare(`
      SELECT COUNT(*) AS count FROM pragma_table_info('suppliers') WHERE name = ?
    `).get(col);
    if (!exists || exists.count === 0) {
      db.exec(`ALTER TABLE suppliers ADD COLUMN ${col} TEXT;`);
    }
  }

  // Migration: add auth_tokens.code for short numeric verification codes (idempotent)
  const codeColumn = db.prepare(`
    SELECT COUNT(*) AS count FROM pragma_table_info('auth_tokens') WHERE name = ?
  `).get('code');
  if (!codeColumn || codeColumn.count === 0) {
    db.exec(`ALTER TABLE auth_tokens ADD COLUMN code TEXT;`);
  }

  // Insert default product categories if they do not exist
  const defaultCategories = [
    { id: 'cat-medicines', name: 'Medicines', parent_id: null, is_regulated: 1, tmda_required: 1 },
    { id: 'cat-equipment', name: 'Medical Equipment', parent_id: null, is_regulated: 0, tmda_required: 0 },
    { id: 'cat-consumables', name: 'Medical Consumables', parent_id: null, is_regulated: 0, tmda_required: 0 },
    { id: 'cat-lab', name: 'Laboratory Supplies', parent_id: null, is_regulated: 1, tmda_required: 1 },
  ];

  const subCategories = [
    { id: 'cat-antibiotics', name: 'Antibiotics', parent_id: 'cat-medicines', is_regulated: 1, tmda_required: 1 },
    { id: 'cat-pain-relief', name: 'Pain Relievers', parent_id: 'cat-medicines', is_regulated: 1, tmda_required: 1 },
    { id: 'cat-vaccines', name: 'Vaccines', parent_id: 'cat-medicines', is_regulated: 1, tmda_required: 1 },
    { id: 'cat-emergency', name: 'Emergency Medicines', parent_id: 'cat-medicines', is_regulated: 1, tmda_required: 1 },
    { id: 'cat-anti-malarial', name: 'Antimalarial Drugs', parent_id: 'cat-medicines', is_regulated: 1, tmda_required: 1 },
    { id: 'cat-diabetes', name: 'Diabetes Medications', parent_id: 'cat-medicines', is_regulated: 1, tmda_required: 1 },
    { id: 'cat-hypertension', name: 'Hypertension Medications', parent_id: 'cat-medicines', is_regulated: 1, tmda_required: 1 },
    { id: 'cat-pediatric', name: 'Pediatric Medicines', parent_id: 'cat-medicines', is_regulated: 1, tmda_required: 1 },
    { id: 'cat-surgical-meds', name: 'Surgical Medicines', parent_id: 'cat-medicines', is_regulated: 1, tmda_required: 1 },
  ];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO categories (id, name, parent_id, is_regulated, tmda_required)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const cat of defaultCategories) {
    insert.run(cat.id, cat.name, cat.parent_id, cat.is_regulated, cat.tmda_required);
  }
  for (const cat of subCategories) {
    insert.run(cat.id, cat.name, cat.parent_id, cat.is_regulated, cat.tmda_required);
  }
}
