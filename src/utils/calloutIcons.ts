/**
 * Callout Icon Handling
 *
 * - Preserves Obsidian's native callout icons (injected via setIcon API)
 * - Discovers theme-specific icons from CSS (--callout-icon, background-image, mask-image)
 * - Falls back to Lucide icon map when needed (export mode)
 * - Applies correct colors from theme CSS
 */

import { requestUrl, setIcon } from 'obsidian';
import { fileToBase64 } from '.';

/** Extract the first usable URL from a CSS value (e.g., url("...")) */
function parseCssUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (!v || v === 'none') return undefined;
  const m = v.match(/url\((?:\"([^\"]+)\"|'([^']+)'|([^'\")]+))\)/);
  const url = m?.[1] || m?.[2] || m?.[3];
  return url?.trim();
}

/** Discover the icon URL from theme CSS */
function discoverCalloutIconUrl(calloutEl: HTMLElement, iconEl: HTMLElement): string | undefined {
  const csCallout = getComputedStyle(calloutEl);
  const csIcon = getComputedStyle(iconEl);

  // Try CSS var on callout container (most reliable)
  const fromVar = parseCssUrl(csCallout.getPropertyValue('--callout-icon'));
  if (fromVar) return fromVar;

  // Try background-image on the icon box
  const fromBg = parseCssUrl(csIcon.backgroundImage);
  if (fromBg) return fromBg;

  // Try mask-image (some themes)
  const fromWMask = parseCssUrl(((csIcon as unknown) as any).webkitMaskImage as string);
  if (fromWMask) return fromWMask;

  const fromMask = parseCssUrl((csIcon as CSSStyleDeclaration & { maskImage?: string }).maskImage);
  return fromMask;
}

/** Fetch icon URL and convert to data URL or Lucide icon ID */
async function fetchAsDataUrl(url: string): Promise<string | undefined> {
  try {
    if (url.startsWith('data:')) return url;

    // Detect Lucide icons and return special marker
    const lucideMatch = url.match(/\/lucide\/([^\/]+)\.svg(?:\?.*)?$/);
    if (lucideMatch) return `lucide:${lucideMatch[1]}`;

    // Handle app:// URLs
    if (url.startsWith('app://')) {
      const appLucideMatch = url.match(/app:\/\/[^\/]+\/.*?\/lucide\/([^\/]+)\.svg(?:\?.*)?$/i);
      if (appLucideMatch) return `lucide:${appLucideMatch[1]}`;
    }

    const res = await requestUrl({ url, method: 'GET' });
    const contentType = res.headers['content-type'] || '';

    // Convert SVG to data URL
    if (contentType.includes('svg') || url.endsWith('.svg')) {
      const text = typeof res.text === 'string' ? res.text : new TextDecoder('utf-8').decode(res.arrayBuffer);
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
    }

    // Convert binary images to data URL
    const blob = new Blob([res.arrayBuffer], { type: contentType || 'application/octet-stream' });
    return await fileToBase64(blob);
  } catch (e) {
    console.warn('[export-image] Failed to fetch icon:', url);
    return undefined;
  }
}

/** Reset icon box styles to prepare for icon injection */
function resetIconBox(iconEl: HTMLElement) {
  iconEl.style.setProperty('background', 'none', 'important');
  iconEl.style.setProperty('-webkit-mask-image', 'none', 'important');
  iconEl.style.setProperty('mask-image', 'none', 'important');
  iconEl.style.display = 'flex';
  iconEl.style.alignItems = 'center';
  iconEl.style.justifyContent = 'center';
  iconEl.style.overflow = 'visible';
  while (iconEl.firstChild) iconEl.removeChild(iconEl.firstChild);
}

/** Get icon size from computed styles */
function sizeFromComputed(iconEl: HTMLElement): { w: number; h: number } {
  const cs = getComputedStyle(iconEl);
  const h = Math.max(14, Math.round(parseFloat(cs.height || '16') || 16));
  const w = Math.max(14, Math.round(parseFloat(cs.width || '16') || 16));
  return { w, h };
}

/** Check if a color value is transparent */
function isTransparentColor(c?: string | null) {
  if (!c) return true;
  const v = c.trim().toLowerCase();
  return v === 'transparent' || v === 'rgba(0, 0, 0, 0)' || v === 'hsla(0, 0%, 0%, 0)';
}

/** Resolve the appropriate color for the icon from theme CSS */
function resolveIconColor(calloutEl: HTMLElement, iconEl: HTMLElement): string {
  const csIcon = getComputedStyle(iconEl);
  if (!isTransparentColor(csIcon.color)) return csIcon.color;

  const title = calloutEl.querySelector<HTMLElement>('.callout-title, .callout-title-inner');
  if (title) {
    const csTitle = getComputedStyle(title);
    if (!isTransparentColor(csTitle.color)) return csTitle.color;
  }

  const csCallout = getComputedStyle(calloutEl);
  if (!isTransparentColor(csCallout.color)) return csCallout.color;
  return 'var(--text-normal, #888)';
}

/** Apply color styling to an SVG icon element */
function styleSvgIcon(svg: SVGElement, color: string, width: number, height: number) {
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.style.setProperty('color', color, 'important');
  svg.style.setProperty('display', 'block', 'important');
  svg.style.setProperty('overflow', 'visible', 'important');
  svg.style.setProperty('opacity', '1', 'important');
  svg.style.setProperty('visibility', 'visible', 'important');

  // Apply color to all SVG shape elements
  const paths = svg.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse');
  paths.forEach((el) => {
    const svgEl = el as SVGElement;
    const hasStroke = svgEl.getAttribute('stroke') !== null ||
                     svgEl.getAttribute('stroke') === 'currentColor' ||
                     window.getComputedStyle(svgEl).stroke !== 'none';
    const fillAttr = svgEl.getAttribute('fill');
    const hasFill = fillAttr !== null && fillAttr !== 'none';

    if (hasStroke) {
      svgEl.setAttribute('stroke', color);
      svgEl.style.setProperty('stroke', color, 'important');
    }
    if (hasFill) {
      svgEl.setAttribute('fill', color);
      svgEl.style.setProperty('fill', color, 'important');
    }
  });
}


/**
 * Inline callout icons dynamically by reading the active CSS
 * @param root - The root element to search for callouts
 * @param debug - Enable debug logging
 * @param injectIfMissing - If true, inject icons using fallback map when discovery fails (for export).
 *                          If false, only preserve existing icons (for preview).
 */
export async function inlineCalloutIconsDynamic(root: HTMLElement, debug = false, injectIfMissing = true) {
  const callouts = root.querySelectorAll<HTMLElement>('.callout');
  for (const ct of Array.from(callouts)) {
    const iconEl = ct.querySelector<HTMLElement>('.callout-icon');
    if (!iconEl) continue;

    const type = (ct.getAttribute('data-callout') || '').toLowerCase();
    const { w, h } = sizeFromComputed(iconEl);

    const existing = iconEl.querySelector('svg, img') as (SVGElement | HTMLImageElement | null);
    let removedEmptySvg = false;

    if (existing) {
      const color = resolveIconColor(ct, iconEl);

      // Check if SVG is empty (Obsidian sometimes uses empty SVGs with CSS masks)
      const isEmpty = existing instanceof SVGElement && (
        existing.children.length === 0 ||
        (existing.children.length === 1 && existing.children[0].tagName.toLowerCase() === 'defs')
      );

      if (debug && existing instanceof SVGElement) {
        const isObsidianSvg = existing.classList.contains('svg-icon');
        console.info('[export-image] Callout icon:', {
          type,
          isEmpty,
          isObsidianSvg,
          pathUsed: isEmpty ? 'will-replace-empty-svg' : (isObsidianSvg ? 'preserve-obsidian' : 'preserve-injected'),
        });
      }

      if (isEmpty) {
        existing.remove();
        removedEmptySvg = true;
      } else {
        // Preserve and style existing icon
        iconEl.style.setProperty('background', 'none', 'important');
        iconEl.style.setProperty('-webkit-mask-image', 'none', 'important');
        iconEl.style.setProperty('mask-image', 'none', 'important');
        iconEl.style.display = 'flex';
        iconEl.style.alignItems = 'center';
        iconEl.style.justifyContent = 'center';
        iconEl.style.overflow = 'visible';
        iconEl.style.minWidth = `${w}px`;
        iconEl.style.minHeight = `${h}px`;
        iconEl.style.setProperty('color', color, 'important');

        if (existing instanceof SVGElement) {
          styleSvgIcon(existing, color, w, h);
        } else {
          (existing as HTMLImageElement).style.width = `${w}px`;
          (existing as HTMLImageElement).style.height = `${h}px`;
          (existing as HTMLImageElement).style.display = 'block';
        }
        continue;
      }
    }

    // Discover from CSS and inline it
    resetIconBox(iconEl);

    let inlined = false;
    const discovered = discoverCalloutIconUrl(ct, iconEl);

    if (discovered) {
      const dataUrl = await fetchAsDataUrl(discovered);
      if (dataUrl?.startsWith('data:')) {
        const img = document.createElement('img');
        img.src = dataUrl;
        img.alt = 'callout-icon';
        img.style.width = `${w}px`;
        img.style.height = `${h}px`;
        img.style.display = 'block';
        iconEl.appendChild(img);
        inlined = true;
        if (debug) console.info('[export-image] Callout icon:', { type, pathUsed: 'imgData' });
      } else if (dataUrl?.startsWith('lucide:')) {
        const iconId = dataUrl.slice('lucide:'.length);
        try {
          setIcon(iconEl, iconId);
          const svg = iconEl.querySelector('svg');
          if (svg) {
            const color = resolveIconColor(ct, iconEl);
            iconEl.style.minWidth = `${w}px`;
            iconEl.style.minHeight = `${h}px`;
            iconEl.style.setProperty('color', color, 'important');
            styleSvgIcon(svg, color, w, h);
            inlined = true;
            if (debug) console.info('[export-image] Callout icon:', { type, lucideId: iconId, pathUsed: 'discovered' });
          }
        } catch (err) {
          console.warn('[export-image] setIcon failed:', iconId);
        }
      }
    }

    // Fallback: inject icon using Obsidian's default mappings
    if (!inlined && (injectIfMissing || removedEmptySvg)) {
      const fallbackMap: Record<string, string> = {
        note: 'pencil',
        abstract: 'clipboard-list', summary: 'clipboard-list', tldr: 'clipboard-list',
        info: 'info',
        todo: 'check-circle-2',
        tip: 'flame', hint: 'flame', important: 'flame',
        success: 'check', check: 'check', done: 'check',
        question: 'help-circle', help: 'help-circle', faq: 'help-circle',
        warning: 'alert-triangle', caution: 'alert-triangle', attention: 'alert-triangle',
        failure: 'x', fail: 'x', missing: 'x',
        danger: 'zap', error: 'zap',
        bug: 'bug',
        example: 'list',
        quote: 'quote', cite: 'quote',
        default: 'info',
      };

      try {
        const iconId = fallbackMap[type] || fallbackMap.default;
        setIcon(iconEl, iconId);
        const svg = iconEl.querySelector('svg');
        if (svg) {
          const color = resolveIconColor(ct, iconEl);
          iconEl.style.minWidth = `${w}px`;
          iconEl.style.minHeight = `${h}px`;
          iconEl.style.setProperty('color', color, 'important');
          styleSvgIcon(svg, color, w, h);
          inlined = true;
          if (debug) console.info('[export-image] Callout icon:', { type, lucideId: iconId, pathUsed: 'fallback' });
        }
      } catch (err) {
        console.warn('[export-image] setIcon failed:', type);
      }
    }

    // Last-resort emoji fallback
    if (!inlined && injectIfMissing) {
      const span = document.createElement('span');
      span.textContent = '❗';
      span.style.fontSize = `${Math.max(w, h)}px`;
      span.style.lineHeight = '1';
      span.style.display = 'block';
      iconEl.appendChild(span);
      if (debug) console.info('[export-image] Callout icon:', { type, pathUsed: 'emoji' });
    }

    if (!inlined && !injectIfMissing && debug) {
      console.info('[export-image] Callout icon skipped (waiting for Obsidian):', { type });
    }
  }
}
