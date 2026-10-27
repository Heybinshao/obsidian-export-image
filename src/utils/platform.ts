import { Platform } from 'obsidian';

/**
 * `Platform.isMobile` has been observed to lag the actual runtime in the mobile
 * webview, which silently switches the export to the desktop path (file-saver
 * instead of the share sheet, and `skipLocalFonts` on — the exported image then
 * loses the vault font). The body classes Obsidian sets on every platform are a
 * reliable second source of truth.
 */
export function isMobileApp(): boolean {
  return Platform.isMobile || document.body.classList.contains('is-mobile');
}

export function isPhoneApp(): boolean {
  return Platform.isPhone || document.body.classList.contains('is-phone');
}
