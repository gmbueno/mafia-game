export const PROTOCOL = 'mafia-2.0';
export const PROMPT_VERSION = 'mafia-player-2.0';
export const MODEL = 'openai/gpt-6.1-sol';
export const MODEL_CONFIG = Object.freeze({ model: MODEL, reasoning: { effort: 'medium', exclude: true }, max_tokens: 4096 });
export const LIMITS = Object.freeze({ speech: 55, memory: 120, days: 15 });
export const DEFAULT_OPTIONS = Object.freeze({ ballotMode: 'nomination', councilRounds: 2, personas: true, randomOrder: true });
export const wordCount = text => text.trim() ? text.trim().split(/\s+/u).length : 0;
export function limitWords(text, limit) { return text.trim().split(/\s+/u).slice(0, limit).join(' '); }
export function seededRandom(seed) {
  let n = seed >>> 0;
  return () => { n = (Math.imul(1664525, n) + 1013904223) >>> 0; return n / 4294967296; };
}
export function hashText(text) {
  // Stable fingerprint for reproducibility, not a cryptographic integrity proof.
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}
