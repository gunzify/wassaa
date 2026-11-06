/**
 * Pack prices are charged in naira (Paystack's settlement currency for this
 * account) but shown in the member's own currency. The API sends an
 * approximate display value alongside the exact naira amount; these helpers
 * keep the two consistent everywhere a price is rendered.
 */
import type { CreditPack } from '../types';

/** Format an amount already expressed in major units (₦2,000, $6, GH₵45). */
export function formatMoney(amount: number, currency: string): string {
  const code = (currency || 'NGN').toUpperCase();
  const value = Number(amount) || 0;
  if (code === 'NGN') return `₦${Math.round(value).toLocaleString('en-NG')}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${code} ${Math.round(value).toLocaleString()}`;
  }
}

/**
 * Price to show for a pack. Falls back to naira when the API did not send a
 * display currency (offline first paint, older cached payload).
 */
export function packPriceLabel(pack: CreditPack): string {
  if (pack.displayCurrency && pack.displayCurrency !== 'NGN' && pack.displayPrice != null) {
    return formatMoney(Number(pack.displayPrice), pack.displayCurrency);
  }
  return `₦${Number(pack.priceNgn || 0).toLocaleString('en-NG')}`;
}

/** The exact naira charge, shown next to an approximate foreign-currency price. */
export function packChargeNote(pack: CreditPack): string | null {
  if (!pack.displayCurrency || pack.displayCurrency === 'NGN') return null;
  return `charged ₦${Number(pack.priceNgn || 0).toLocaleString('en-NG')}`;
}
