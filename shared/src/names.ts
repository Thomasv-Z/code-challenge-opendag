// A deliberately small blocklist; this is an open-day kiosk, not a moderation system.
const BLOCKED = [
  // Short words like "lul" or "pik" are left out: they'd block names such as Lulu or Pikachu.
  'kutje', 'hoer', 'kanker', 'tering', 'tyfus', 'klootzak', 'neuk', 'slet', 'mongool',
  'fuck', 'shit', 'bitch', 'cunt', 'pussy', 'nigger', 'nigga', 'faggot', 'whore', 'slut', 'nazi', 'hitler',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

export function isNameAllowed(name: string): boolean {
  const flat = name
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => LEET[c])
    .replace(/[^a-z]/g, '');
  return !BLOCKED.some((w) => flat.includes(w));
}
