import { auth } from '../firebase/config';

const REQUEST_TYPE = 'VENPRO_EXTENSION_TOKEN_REQUEST';
const RESPONSE_TYPE = 'VENPRO_EXTENSION_TOKEN_RESPONSE';

let bridgeStarted = false;

export function startExtensionTokenBridge() {
  if (bridgeStarted || typeof window === 'undefined') return;
  bridgeStarted = true;

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data?.type !== REQUEST_TYPE) return;

    try {
      const token = await auth.currentUser?.getIdToken();
      window.postMessage(
        {
          type: RESPONSE_TYPE,
          requestId: event.data.requestId,
          token: token || null,
        },
        window.location.origin
      );
    } catch {
      window.postMessage(
        {
          type: RESPONSE_TYPE,
          requestId: event.data.requestId,
          token: null,
        },
        window.location.origin
      );
    }
  });
}
