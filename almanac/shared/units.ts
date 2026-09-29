// Almanac stores mass in kilograms and length in centimetres. Display units are a setting.

export type WeightUnit = 'lb' | 'kg';
export type LengthUnit = 'in' | 'cm';

export const LB_PER_KG = 2.2046226218;
export const CM_PER_IN = 2.54;

export function kgTo(kg: number, unit: WeightUnit): number {
  return unit === 'lb' ? kg * LB_PER_KG : kg;
}
export function toKg(v: number, unit: WeightUnit): number {
  return unit === 'lb' ? v / LB_PER_KG : v;
}
export function cmTo(cm: number, unit: LengthUnit): number {
  return unit === 'in' ? cm / CM_PER_IN : cm;
}
export function toCm(v: number, unit: LengthUnit): number {
  return unit === 'in' ? v * CM_PER_IN : v;
}

/** Round for display: whole-ish numbers lose their trailing .0 */
export function roundTo(v: number, step = 0.1): number {
  return Math.round(v / step) * step;
}
