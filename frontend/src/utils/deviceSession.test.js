const api = require('../services/api').default;
const { getOrCreateDeviceId, registerDeviceSession } = require('./deviceSession');

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(() => Promise.resolve({ data: { ok: true } })),
  },
}));

describe('deviceSession', () => {
  beforeEach(() => {
    window.localStorage.clear();
    api.post.mockClear();
  });

  test('reutiliza o mesmo device id salvo', () => {
    const first = getOrCreateDeviceId();
    const second = getOrCreateDeviceId();

    expect(first).toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(16);
  });

  test('registra sessao de dispositivo na api', async () => {
    await registerDeviceSession();

    expect(api.post).toHaveBeenCalledWith(
      '/users/device-session',
      expect.objectContaining({
        deviceId: expect.any(String),
        platform: expect.any(String),
        language: expect.any(String),
      })
    );
  });
});
