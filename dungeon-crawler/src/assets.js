export const ASSET_BASE = import.meta.env.VITE_ASSET_BASE || '';
export function asset(path) {
    if (!path) return path;
    if (path.startsWith('http')) return path;
    if (ASSET_BASE && path.startsWith(ASSET_BASE)) return path;
    return ASSET_BASE + path;
}
