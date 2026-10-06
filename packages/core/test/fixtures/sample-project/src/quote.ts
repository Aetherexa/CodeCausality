import { price } from './pricing.js';

export const quote = (base: number): number => price(base);
