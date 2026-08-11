import { useEffect } from 'react';

const SITE_NAME = 'Unbrand Agency';
const DEFAULT_DESCRIPTION =
  'Unbrand Agency is performance marketing reporting software for agencies and marketers. Import campaign data from CSV or Excel and generate professional, client-ready PDF reports.';

const setMeta = (attr, key, content) => {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
};

const setCanonical = (href) => {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
};

// Lightweight, dependency-free head manager for the public site -- avoids
// pulling in react-helmet-async just to set a title and a handful of meta
// tags on ~11 static pages.
export default function SEO({ title, description = DEFAULT_DESCRIPTION, path = '/' }) {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Performance Marketing Reporting Software`;
    document.title = fullTitle;

    setMeta('name', 'description', description);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:site_name', SITE_NAME);
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', description);

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}${path}`;
    setMeta('property', 'og:url', url);
    setCanonical(url);
  }, [title, description, path]);

  return null;
}
