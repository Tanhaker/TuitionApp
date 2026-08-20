/**
 * Phone number handling for sign-in.
 *
 * Supabase wants E.164 ("+919876543210"). Teachers will type what they know —
 * "9876543210", "98765 43210", "+91 98765-43210" — so we normalise rather than
 * making them get the format right on a phone keypad in a noisy room.
 */

const DEFAULT_COUNTRY = "91"; // India

/** Does this look like someone trying to enter a phone number rather than an email? */
export function looksLikePhone(input: string): boolean {
  const v = input.trim();
  if (v.includes("@")) return false;
  // Digits, spaces, dashes, brackets and an optional leading +, with enough
  // digits to be a real number.
  if (!/^\+?[\d\s\-()]+$/.test(v)) return false;
  return v.replace(/\D/g, "").length >= 8;
}

/**
 * Normalise to E.164, or null if it cannot be made into a plausible number.
 *
 * A bare 10-digit number is assumed Indian; "0" prefixes are stripped, since
 * that is the domestic trunk prefix and not part of the international number.
 */
export function toE164(input: string): string | null {
  const raw = input.trim();
  const hadPlus = raw.startsWith("+");
  let digits = raw.replace(/\D/g, "");

  if (!digits) return null;

  if (!hadPlus) {
    // 09876543210 -> 9876543210
    while (digits.startsWith("0")) digits = digits.slice(1);
    // 9876543210 -> 919876543210
    if (digits.length === 10) digits = DEFAULT_COUNTRY + digits;
  }

  if (digits.length < 10 || digits.length > 15) return null;
  return "+" + digits;
}
