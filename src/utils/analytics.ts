import { logger } from './logger';

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || '';

/**
 * Initializes Google Analytics dynamically if VITE_GA_MEASUREMENT_ID is provided.
 * Configured specifically to be safe for both web browsers and Electron desktop apps
 * by disabling cookie storage and using a localStorage-backed clientId.
 */
export function initAnalytics() {
  if (!GA_ID) {
    logger.log('[Analytics] VITE_GA_MEASUREMENT_ID not configured. Skipping initialization.');
    return;
  }

  try {
    // 1. Load the gtag.js script dynamically
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(script);

    // 2. Set up global gtag function
    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).gtag = function() {
      (window as any).dataLayer.push(arguments);
    };

    const gtag = (window as any).gtag;
    gtag('js', new Date());

    // 3. Generate or retrieve custom client ID (to bypass cookie block in file://)
    let clientId = localStorage.getItem('ga_client_id');
    if (!clientId) {
      clientId = typeof crypto.randomUUID === 'function' 
        ? crypto.randomUUID() 
        : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('ga_client_id', clientId);
    }

    // 4. Configure gtag with disabled cookie storage
    gtag('config', GA_ID, {
      client_storage: 'none',
      client_id: clientId,
      page_path: window.location.pathname,
      anonymize_ip: true
    });

    logger.log(`[Analytics] Initialized successfully with ID ${GA_ID}`);
  } catch (err) {
    logger.error('[Analytics] Failed to initialize:', err);
  }
}

/**
 * Tracks a custom event in Google Analytics.
 */
export function trackEvent(action: string, category: string, label?: string, value?: number) {
  if (!GA_ID || !(window as any).gtag) return;

  try {
    (window as any).gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value
    });
  } catch (err) {
    logger.error('[Analytics] Event tracking failed:', err);
  }
}

/**
 * Tracks a page view event.
 */
export function trackPageView(pagePath: string, title?: string) {
  if (!GA_ID || !(window as any).gtag) return;

  try {
    (window as any).gtag('event', 'page_view', {
      page_path: pagePath,
      page_title: title || document.title
    });
  } catch (err) {
    logger.error('[Analytics] Page view tracking failed:', err);
  }
}
