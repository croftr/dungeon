export const ASSET_BASE = import.meta.env.VITE_ASSET_BASE || '';
export function asset(path) { return ASSET_BASE + path; }
