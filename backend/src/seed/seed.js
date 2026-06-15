import db from '../config/database.js';
import { initDatabase } from '../config/database.js';
import { initCartTable } from '../services/cartService.js';
import { env } from '../config/env.js';
import { registerUser } from '../services/authService.js';
import { createProduct, updateProduct, createBatch, findCategoryById } from '../models/productModel.js';
import { findSupplierByOrganisationId, updateSupplierVerification } from '../models/supplierModel.js';
import { findUserByEmail } from '../models/userModel.js';

const PASSWORD = env.SEED_TEST_PASSWORD;

function seedCategories() {
  // Default categories are inserted by initDatabase; ensure subcategories exist
  const subCategories = [
    { id: 'cat-hospital-beds', name: 'Hospital Beds', parent_id: 'cat-equipment' },
    { id: 'cat-wheelchairs', name: 'Wheelchairs', parent_id: 'cat-equipment' },
    { id: 'cat-bp-monitors', name: 'Blood Pressure Monitors', parent_id: 'cat-equipment' },
    { id: 'cat-surgical-gloves', name: 'Surgical Gloves', parent_id: 'cat-consumables' },
    { id: 'cat-syringes', name: 'Syringes', parent_id: 'cat-consumables' },
    { id: 'cat-face-masks', name: 'Face Masks', parent_id: 'cat-consumables' },
    { id: 'cat-test-kits', name: 'Test Kits', parent_id: 'cat-lab' },
    { id: 'cat-reagents', name: 'Reagents', parent_id: 'cat-lab' },
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO categories (id, name, parent_id, is_regulated, tmda_required)
    VALUES (?, ?, ?, 0, 0)
  `);
  for (const cat of subCategories) {
    stmt.run(cat.id, cat.name, cat.parent_id);
  }
}

async function seedUsers() {
  const users = [
    {
      email: 'hospital.test@medicarehub.test',
      password: PASSWORD,
      first_name: 'Hospital',
      last_name: 'Procurement',
      role: 'HOSPITAL',
      organisation_name: 'Test General Hospital',
      organisation_type: 'HOSPITAL',
      registration_number: 'REG-HOS-001',
      tmda_license: 'TMDA-HOS-001',
    },
    {
      email: 'supplier.test@medicarehub.test',
      password: PASSWORD,
      first_name: 'MedSupply',
      last_name: 'Manager',
      role: 'SUPPLIER',
      organisation_name: 'MedSupply Tanzania Ltd',
      organisation_type: 'SUPPLIER',
      registration_number: 'BRELA-123456',
      tmda_license: 'TMDA-SUP-789',
    },
    {
      email: 'pharmaplus.test@medicarehub.test',
      password: PASSWORD,
      first_name: 'PharmaPlus',
      last_name: 'Manager',
      role: 'SUPPLIER',
      organisation_name: 'PharmaPlus Distributors Ltd',
      organisation_type: 'SUPPLIER',
      registration_number: 'BRELA-223344',
      tmda_license: 'TMDA-SUP-456',
    },
    {
      email: 'afya.test@medicarehub.test',
      password: PASSWORD,
      first_name: 'Afya',
      last_name: 'Manager',
      role: 'SUPPLIER',
      organisation_name: 'Afya Medical Supplies',
      organisation_type: 'SUPPLIER',
      registration_number: 'BRELA-998877',
      tmda_license: 'TMDA-SUP-112',
    },
    {
      email: 'admin.test@medicarehub.test',
      password: PASSWORD,
      first_name: 'Platform',
      last_name: 'Admin',
      role: 'ADMIN',
      organisation_name: 'MediCare Hub Admin',
      organisation_type: 'HOSPITAL',
    },
  ];

  for (const u of users) {
    try {
      if (!findUserByEmail(u.email)) {
        const user = registerUser(u);
        // Seed accounts are created by the platform itself — pre-verify them
        // so the new "is_verified required to log in" gate doesn't lock the
        // demo data out. Real sign-ups still arrive unverified.
        if (!user.is_verified) {
          db.prepare('UPDATE users SET is_verified = 1, updated_at = ? WHERE id = ?')
            .run(new Date().toISOString(), user.id);
        }
      }
    } catch (error) {
      console.warn(`Warning seeding ${u.email}:`, error.message);
    }
  }
}

// Canonical product catalog. The GTIN is the shared identity that lets the
// same item be offered by multiple suppliers and compared side by side.
const CATALOG = {
  AMX: {
    name: 'Amoxicillin 500mg Capsules',
    generic_name: 'Amoxicillin',
    gtin: '06001234500017',
    category_id: 'cat-antibiotics',
    unit_of_measure: 'Strip of 10 capsules',
    description: 'Broad-spectrum antibiotic for bacterial infections.',
    minimum_order_quantity: 10,
    tmda_registration_number: 'TMDA-AMX-001',
  },
  PCM: {
    name: 'Paracetamol 500mg Tablets',
    generic_name: 'Paracetamol',
    gtin: '06001234500024',
    category_id: 'cat-pain-relief',
    unit_of_measure: 'Box of 100 tablets',
    description: 'Pain reliever and fever reducer.',
    minimum_order_quantity: 5,
  },
  GLV: {
    name: 'Disposable Surgical Gloves (Latex)',
    generic_name: 'Surgical Gloves',
    gtin: '06001234500031',
    category_id: 'cat-surgical-gloves',
    unit_of_measure: 'Box of 100 pairs',
    description: 'Powder-free latex surgical gloves.',
    minimum_order_quantity: 2,
  },
  BPM: {
    name: 'Digital Blood Pressure Monitor',
    generic_name: 'BP Monitor',
    gtin: '06001234500048',
    category_id: 'cat-bp-monitors',
    unit_of_measure: 'Unit',
    description: 'Automatic upper-arm blood pressure monitor.',
    minimum_order_quantity: 1,
  },
  RDT: {
    name: 'Malaria Rapid Diagnostic Test Kit',
    generic_name: 'RDT Kit',
    gtin: '06001234500055',
    category_id: 'cat-test-kits',
    unit_of_measure: 'Kit of 25 tests',
    description: 'Rapid malaria antigen detection kit.',
    minimum_order_quantity: 2,
    tmda_registration_number: 'TMDA-RDT-002',
  },
};

// Each supplier carries an overlapping subset of the catalog at its own price,
// with a distinct trust score and delivery speed so buyers see real trade-offs.
const SUPPLIER_OFFERINGS = [
  {
    email: 'supplier.test@medicarehub.test',
    code: 'MS',
    trust_score: 85,
    average_delivery_days: 3,
    offerings: { AMX: 1500, PCM: 800, GLV: 25000, BPM: 180000, RDT: 45000 },
  },
  {
    email: 'pharmaplus.test@medicarehub.test',
    code: 'PP',
    trust_score: 72,
    average_delivery_days: 5,
    offerings: { AMX: 1400, PCM: 750, GLV: 26000, RDT: 43000 },
  },
  {
    email: 'afya.test@medicarehub.test',
    code: 'AF',
    trust_score: 93,
    average_delivery_days: 2,
    offerings: { AMX: 1650, PCM: 820, BPM: 172000, RDT: 47000 },
  },
];

function seedProducts() {
  for (const s of SUPPLIER_OFFERINGS) {
    const supplierUser = findUserByEmail(s.email);
    if (!supplierUser) continue;

    const supplier = findSupplierByOrganisationId(supplierUser.organisation_id);
    if (!supplier) continue;

    // Verify the supplier so its products are public, and give it a distinct
    // trust score / delivery speed for buyers to compare.
    if (supplier.verification_status !== 'VERIFIED') {
      updateSupplierVerification(supplier.id, { verification_status: 'VERIFIED' });
    }
    db.prepare(
      'UPDATE suppliers SET trust_score = ?, average_delivery_days = ?, updated_at = ? WHERE id = ?'
    ).run(s.trust_score, s.average_delivery_days, new Date().toISOString(), supplier.id);

    for (const [code, price] of Object.entries(s.offerings)) {
      const cat = CATALOG[code];
      const data = { ...cat, price, supplier_id: supplier.id };

      // Upsert so re-running the seed keeps GTINs/prices consistent across the
      // products created in earlier runs.
      const existing = db
        .prepare('SELECT id FROM products WHERE name = ? AND supplier_id = ?')
        .get(cat.name, supplier.id);

      if (existing) {
        updateProduct(existing.id, data);
        continue;
      }

      const product = createProduct(data);

      // Add batches (globally unique batch numbers per supplier + product).
      const batchCount = 2;
      for (let i = 0; i < batchCount; i++) {
        const expiry = new Date();
        expiry.setFullYear(expiry.getFullYear() + 1 + i);
        const mfg = new Date();
        mfg.setFullYear(mfg.getFullYear() - i);
        createBatch({
          product_id: product.id,
          supplier_id: supplier.id,
          batch_number: `${code}-${s.code}-2025-${String(i + 1).padStart(3, '0')}`,
          manufacture_date: mfg.toISOString().split('T')[0],
          expiry_date: expiry.toISOString().split('T')[0],
          quantity: 500 - i * 100,
          unit_cost: price * 0.7,
          storage_conditions: 'Room temperature, dry place',
        });
      }
    }
  }
}

async function main() {
  initDatabase();
  initCartTable();
  seedCategories();
  await seedUsers();
  seedProducts();

  console.log('Seed completed successfully.');
  console.log('Demo accounts:');
  console.log('  hospital.test@medicarehub.test /', PASSWORD);
  console.log('  supplier.test@medicarehub.test /', PASSWORD, '(MedSupply Tanzania Ltd)');
  console.log('  pharmaplus.test@medicarehub.test /', PASSWORD, '(PharmaPlus Distributors Ltd)');
  console.log('  afya.test@medicarehub.test /', PASSWORD, '(Afya Medical Supplies)');
  console.log('  admin.test@medicarehub.test /', PASSWORD);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
