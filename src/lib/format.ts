/**
 * Format amount in Indian Rupee system with proper comma separation.
 * e.g., 1300 → ₹1,300 | 130000 → ₹1,30,000
 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format number with Indian comma system (no currency symbol).
 * e.g., 1300 → 1,300 | 130000 → 1,30,000
 */
export function formatIndianNumber(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
