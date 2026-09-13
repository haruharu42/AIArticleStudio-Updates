export const MOBILE_NAV_PREFERENCE_KEY = "aas-pwa-bottom-nav-always";
export const MOBILE_NAV_PREFERENCE_EVENT = "aas-pwa-bottom-nav-preference";

export function readMobileNavAlways(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(MOBILE_NAV_PREFERENCE_KEY) !== "0";
}

export function writeMobileNavAlways(value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MOBILE_NAV_PREFERENCE_KEY, value ? "1" : "0");
  window.dispatchEvent(new CustomEvent<boolean>(MOBILE_NAV_PREFERENCE_EVENT, { detail: value }));
}
