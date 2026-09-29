// The app is client-only (3D, IndexedDB saves), same as the desktop build, so
// skip SSR and ship prerendered shells: server rendering it cost more CPU
// than the Workers free plan allows.
export const ssr = false;
export const prerender = true;
