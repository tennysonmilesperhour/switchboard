/**
 * One location fix, the way real phones need asking for it.
 *
 * Indoors, a high-accuracy request waits on a GPS lock that may never come
 * and ends in TIMEOUT (or POSITION_UNAVAILABLE), while a Wi-Fi or cell fix
 * would have answered in a second. So a failed high-accuracy ask is retried
 * once without it. A rough answer is still an answer: callers decide what an
 * approximate fix may be used for (`isApproximateFix`).
 *
 * Permission problems are not retried: asking again cannot change them.
 */
export const LOW_ACCURACY_RETRY: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 60_000,
  timeout: 10_000,
};

export function locate(
  geolocation: Pick<Geolocation, 'getCurrentPosition'>,
  options: PositionOptions,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      resolve,
      (error) => {
        const retry =
          options.enableHighAccuracy &&
          (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE);
        if (!retry) {
          reject(error);
          return;
        }
        geolocation.getCurrentPosition(resolve, reject, LOW_ACCURACY_RETRY);
      },
      options,
    );
  });
}

/**
 * Browsers only give location to a secure page. Opened over plain http (a dev
 * server reached at http://192.168.x.x from a phone, say), every request is
 * refused as if the person had said no, and "permission denied" sends them
 * hunting through settings that are already right.
 */
export const INSECURE_PAGE =
  'Location only works on a secure (https) page. Open Switchboard at its https address and try again.';

export function insecurePage(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext === false;
}

/**
 * Once a site is denied, iOS Safari and Chrome stop asking: the only way back
 * is a setting, so name where it is.
 */
export const LOCATION_DENIED =
  'Location is off for this site. On iPhone: Settings › Privacy & Security › Location Services › Safari Websites. In Chrome: tap the icon beside the address, then Permissions › Location.';
