/**
 * Where the API server lives. Empty means same origin (the local server, or Vite's
 * dev proxy). On GitHub Pages it's set at build time via VITE_API_URL.
 */
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export const WS_URL = API_URL
  ? `${API_URL.replace(/^http/, 'ws')}/ws`
  : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

/** Base path the app is served from, e.g. "/code-challenge-opendag/" on GitHub Pages. */
export const BASE_PATH = import.meta.env.BASE_URL;

/** Public URL of the game itself. */
export const APP_URL = location.origin + BASE_PATH;
