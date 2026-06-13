import { ordersApi } from '@/api/ordersApi';

export const cartService = {
  getCart: ordersApi.getCart,
  addToCart: ordersApi.addToCart,
  removeFromCart: ordersApi.removeFromCart,
};
