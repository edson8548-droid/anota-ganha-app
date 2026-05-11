import api from '../services/api';

const DEVICE_ID_KEY = 'venpro_device_id';

const randomDeviceId = () => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  const bytes = new Uint8Array(24);
  window.crypto?.getRandomValues?.(bytes);
  const suffix = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `device-${Date.now()}-${suffix}`;
};

export const getOrCreateDeviceId = () => {
  let existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing && existing.length >= 16) {
    return existing;
  }

  existing = randomDeviceId();
  window.localStorage.setItem(DEVICE_ID_KEY, existing);
  return existing;
};

export const registerDeviceSession = async () => {
  const payload = {
    deviceId: getOrCreateDeviceId(),
    platform: window.navigator?.platform || '',
    language: window.navigator?.language || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    screenWidth: window.screen?.width || 0,
    screenHeight: window.screen?.height || 0,
    appVersion: process.env.REACT_APP_VERSION || '',
  };

  return api.post('/users/device-session', payload);
};
