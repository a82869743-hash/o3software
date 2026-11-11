/**
 * App-wide typing rules for phone and number-plate fields that are plain <input>s
 * (the shared <Input> component applies the same rules itself; the server re-checks everything):
 *   <input type="tel">                          → digits only, max 10
 *   placeholder showing a plate (e.g. MH01AB1234) → uppercase letters/digits only, max 11
 * Runs in the capture phase, before React reads the value, so controlled inputs stay in sync.
 */
const PLATE_HINT = /\b[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{4}\b/;

export function installStrictFields() {
  document.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    if (!el || el.tagName !== 'INPUT' || el.dataset.freeFormat !== undefined) return;
    let next: string | null = null;
    const hint = `${el.name || ''} ${el.placeholder || ''}`;
    const isPhone = el.type === 'tel' || (el.type === 'text' && /(mobile|phone|whatsapp)/i.test(hint) && !/search|name|email/i.test(hint));
    if (isPhone) next = el.value.replace(/\D/g, '').slice(0, 10);
    else if (el.type === 'text' && PLATE_HINT.test(el.placeholder || '')) next = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
    if (next !== null && next !== el.value) el.value = next;
  }, true);
}
