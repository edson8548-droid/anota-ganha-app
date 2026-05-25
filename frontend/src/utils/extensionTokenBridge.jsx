export function startExtensionTokenBridge() {
  // Kept as a no-op for older imports. Extensions now read the same-origin
  // Firebase session from IndexedDB, so the app never posts ID tokens to window.
}
