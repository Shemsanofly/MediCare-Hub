import { body, param } from 'express-validator';
import {
  getPaymentMethods,
  initiateSimulation,
  completeSimulation,
  getSimulationStatus,
} from '../services/paymentSimulationService.js';

export async function listMethods(req, res, next) {
  try {
    res.json({ results: getPaymentMethods() });
  } catch (error) {
    next(error);
  }
}

export const initiateValidation = [
  body('order_id').isString().trim().notEmpty(),
  body('payment_method').isIn(['mpesa', 'airtel', 'mixx', 'halopesa', 'selcom', 'card', 'bank_transfer']),
  body('phone').optional().trim(),
];

export async function initiate(req, res, next) {
  try {
    const result = initiateSimulation(req.user, req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function complete(req, res, next) {
  try {
    const result = completeSimulation(req.user, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function status(req, res, next) {
  try {
    const result = getSimulationStatus(req.params.id, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
