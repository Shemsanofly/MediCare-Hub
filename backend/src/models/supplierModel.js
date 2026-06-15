import db from '../config/database.js';
import { generateId, nowISO } from '../utils/helpers.js';

export function findSupplierById(id) {
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
}

export function findSupplierByOrganisationId(organisationId) {
  return db.prepare('SELECT * FROM suppliers WHERE organisation_id = ?').get(organisationId);
}

export function createSupplier({ organisation_id, brela_registration_number, tmda_license_number, license_expiry_date, trust_score = 0, verification_status = 'PENDING' }) {
  const id = generateId();
  const now = nowISO();
  db.prepare(`
    INSERT INTO suppliers (id, organisation_id, brela_registration_number, tmda_license_number, license_expiry_date, trust_score, verification_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, organisation_id, brela_registration_number || null, tmda_license_number || null, license_expiry_date || null, trust_score, verification_status, now, now);
  return findSupplierById(id);
}

export function setSupplierKyc(id, { nida_number, kyc_status }) {
  db.prepare('UPDATE suppliers SET nida_number = ?, kyc_status = ?, updated_at = ? WHERE id = ?')
    .run(nida_number || null, kyc_status || null, nowISO(), id);
  return findSupplierById(id);
}

export function updateSupplierVerification(id, { verification_status, verified_by, verified_at, rejection_reason }) {
  db.prepare(`
    UPDATE suppliers
    SET verification_status = ?, verified_by = ?, verified_at = ?, rejection_reason = ?, updated_at = ?
    WHERE id = ?
  `).run(
    verification_status,
    verified_by || null,
    verified_at || null,
    rejection_reason || null,
    nowISO(),
    id
  );

  // Sync organisation verification status
  const supplier = findSupplierById(id);
  if (supplier) {
    db.prepare('UPDATE organisations SET is_verified = ?, verified_at = ? WHERE id = ?').run(
      verification_status === 'VERIFIED' ? 1 : 0,
      verification_status === 'VERIFIED' ? (verified_at || nowISO()) : null,
      supplier.organisation_id
    );
  }

  return findSupplierById(id);
}

export function listSuppliers({ search = '', status = '', limit = 50, offset = 0 } = {}) {
  let sql = `
    SELECT s.*, o.name as organisation_name
    FROM suppliers s
    JOIN organisations o ON o.id = s.organisation_id
    WHERE 1=1
  `;
  const params = [];
  if (search) {
    sql += ` AND (o.name LIKE ? OR s.brela_registration_number LIKE ? OR s.tmda_license_number LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status) {
    sql += ` AND s.verification_status = ?`;
    params.push(status);
  }
  sql += ` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}

export function countSuppliers({ search = '', status = '' } = {}) {
  let sql = `
    SELECT COUNT(*) as count
    FROM suppliers s
    JOIN organisations o ON o.id = s.organisation_id
    WHERE 1=1
  `;
  const params = [];
  if (search) {
    sql += ` AND (o.name LIKE ? OR s.brela_registration_number LIKE ? OR s.tmda_license_number LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status) {
    sql += ` AND s.verification_status = ?`;
    params.push(status);
  }
  return db.prepare(sql).get(...params).count;
}
