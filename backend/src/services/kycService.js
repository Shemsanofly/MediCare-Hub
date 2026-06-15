import { ValidationError } from '../utils/errors.js';

// Simulated NIDA (National Identification Authority) KYC for supplier onboarding.
// A NIDA number is 20 digits. The applicant answers knowledge-based security
// questions (free text, one at a time) of the kind NIDA uses. Because this is a
// simulation with no real identity registry, an answer is counted as "correct"
// when it is plausible for that question (non-empty / right format). The
// applicant must get at least 3 of 5 right to be verified.

const QUESTIONS = [
  { id: 'primary_school', prompt: 'What is the name of the primary school you attended?' },
  { id: 'primary_school_year', prompt: 'In which year did you complete primary school?' },
  { id: 'mother_name', prompt: "What is your mother's full name?" },
  { id: 'nida_phone', prompt: 'What phone number did you use during your NIDA registration?' },
  { id: 'birth_region', prompt: 'In which region were you born?' },
];

const VALIDATORS = {
  primary_school: (v) => v.trim().length >= 3,
  primary_school_year: (v) => /^(19|20)\d{2}$/.test(v.trim()),
  mother_name: (v) => v.trim().length >= 3 && /[a-z]/i.test(v),
  nida_phone: (v) => v.replace(/\D/g, '').length >= 9,
  birth_region: (v) => v.trim().length >= 3 && /[a-z]/i.test(v),
};

const REQUIRED_CORRECT = 3;

export function isValidNida(nida) {
  return typeof nida === 'string' && /^\d{20}$/.test(nida);
}

export function maskNida(nida) {
  return `${nida.slice(0, 2)}${'•'.repeat(14)}${nida.slice(-4)}`;
}

/** Build the free-text security-question challenge for a NIDA number. */
export function generateKycChallenge(nida) {
  if (!isValidNida(nida)) {
    throw new ValidationError('NIDA number must be exactly 20 digits');
  }
  return {
    nida_masked: maskNida(nida),
    required_correct: REQUIRED_CORRECT,
    total: QUESTIONS.length,
    questions: QUESTIONS,
  };
}

/** Grade the submitted free-text answers. */
export function gradeKyc(nida, answers = {}) {
  if (!isValidNida(nida)) {
    throw new ValidationError('NIDA number must be exactly 20 digits');
  }
  let score = 0;
  for (const q of QUESTIONS) {
    const answer = String(answers?.[q.id] ?? '');
    if (VALIDATORS[q.id](answer)) score += 1;
  }
  return { passed: score >= REQUIRED_CORRECT, score, required: REQUIRED_CORRECT, total: QUESTIONS.length };
}
