// No 0/O/1/I to keep order numbers easy to read over the phone.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomString(length: number, alphabet: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function orderNumber(): string {
  return `BSH-${randomString(6, ALPHABET)}`;
}

export function accessToken(): string {
  return randomString(32, ALPHABET + 'abcdefghijkmnpqrstuvwxyz');
}
