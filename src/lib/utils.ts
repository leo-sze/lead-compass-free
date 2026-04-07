import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalizes a Brazilian phone number to +55DDDNUMBER format.
 * Examples:
 *   (41) 3668-0680  → +554136680680
 *   41 99999-1234   → +5541999991234
 *   +55 41 3668-0680 → +554136680680
 *   null → null
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  // Strip all non-digit characters
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  // Remove country code if present
  if (digits.startsWith("55") && digits.length >= 12) {
    digits = digits.slice(2);
  }
  // Should have 10 (landline) or 11 (mobile) digits: DDD + number
  if (digits.length < 10 || digits.length > 11) {
    // Return best effort
    return `+55${digits}`;
  }
  return `+55${digits}`;
}
