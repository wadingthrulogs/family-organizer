// Filters that decide whether a calendar event's `location` string is worth
// sending to the Google Routes API. The goal is to avoid quota waste on the
// many non-address strings Google Calendar accepts ("Zoom", URLs, "TBD", etc.).

export function normalizeLocation(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

const URL_RE = /^(https?:\/\/|www\.)/i;
const PLATFORM_RE = /(zoom\.us|meet\.google|teams\.microsoft|webex\.com|gotomeeting|hangouts\.google|skype\.com)/i;
const BARE_NON_ADDRESS_RE =
  /^(zoom|online|virtual|teams|google ?meet|google ?hangout|skype|webex|hangout|phone(?: ?call)?|call|tbd|n\/?a|none|tba|home)$/i;
const PHONE_LIKE_RE = /^[\d\s().+\-]+$/;

export function isObviouslyNotAddress(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return true;
  if (URL_RE.test(trimmed)) return true;
  if (PLATFORM_RE.test(trimmed)) return true;
  if (PHONE_LIKE_RE.test(trimmed) && /\d/.test(trimmed)) return true;
  if (BARE_NON_ADDRESS_RE.test(trimmed)) return true;
  return false;
}
