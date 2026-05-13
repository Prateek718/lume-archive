// Number-to-word helpers. Extracted from lib/gemini/shared.ts during Phase
// XIII-b cleanup so client UI code (issue labels, scan-number prose) can
// import cardinal without pulling in the deleted Gemini-direct module.

const ONES  = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS  = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function cardinal(n: number): string {
  if (n < 0 || !Number.isInteger(n)) return String(n);
  if (n === 0) return 'zero';
  if (n < 10)  return ONES[n];
  if (n < 20)  return TEENS[n - 10];
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return ones === 0 ? TENS[tens] : `${TENS[tens]}-${ONES[ones]}`;
  }
  return String(n);
}
