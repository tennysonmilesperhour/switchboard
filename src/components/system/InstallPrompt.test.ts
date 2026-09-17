import { afterEach, expect, test, vi } from 'vitest';
import { InstallPrompt } from './InstallPrompt';

const hooks = vi.hoisted(() => ({ cleanup: undefined as undefined | (() => void), setDeferred: vi.fn() }));
vi.mock('react', () => ({
  useState: () => [null, hooks.setDeferred],
  useEffect: (effect: () => undefined | (() => void)) => { hooks.cleanup = effect(); },
}));
vi.mock('@/components/system/BottomOverlaySlot', () => ({ useBottomOverlaySlot: () => false }));

afterEach(() => {
  hooks.cleanup?.();
  hooks.cleanup = undefined;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test.each(['Chrome', 'SamsungBrowser', 'Firefox', 'EdgA'])(
  'Android %s suppresses installation even after a saved dismissal', (browser) => {
    const surface = new EventTarget();
    vi.stubGlobal('window', surface);
    vi.stubGlobal('navigator', { userAgent: `Mozilla/5.0 (Linux; Android 16) ${browser}/140` });
    const getItem = vi.fn(() => '1');
    vi.stubGlobal('localStorage', { getItem });
    expect(InstallPrompt()).toBeNull();
    const event = new Event('beforeinstallprompt', { cancelable: true });
    surface.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(hooks.setDeferred).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    hooks.cleanup?.();
    const afterUnmount = new Event('beforeinstallprompt', { cancelable: true });
    surface.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
  },
);

test('desktop still offers browser installation', () => {
  const surface = Object.assign(new EventTarget(), { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('window', surface);
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh) Chrome/140' });
  vi.stubGlobal('localStorage', { getItem: () => null });
  InstallPrompt();
  const event = new Event('beforeinstallprompt', { cancelable: true });
  surface.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(hooks.setDeferred).toHaveBeenCalledWith(event);
});
