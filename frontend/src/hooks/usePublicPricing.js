import { useEffect, useState } from 'react';
import { getPublicPricing } from '../utils/api';

// Fallback only used if the network request fails before the canonical
// values load -- mirrors backend/src/config/pricing.js exactly so there is
// never a moment where mismatched numbers could render. The API call
// (GET /api/public/pricing) is the actual source of truth.
const FALLBACK = {
  free: { monthly: 0, yearly: 0 },
  pro: { monthly: 999, yearly: 9990 },
  agency: { monthly: 2500, yearly: 25000 },
};

export default function usePublicPricing() {
  const [plans, setPlans] = useState(FALLBACK);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPublicPricing()
      .then((data) => {
        if (!cancelled && data?.plans) setPlans(data.plans);
      })
      .catch(() => {
        // Keep the fallback -- it mirrors the canonical file, so pricing
        // shown is still correct even if the request fails.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  return { plans, loaded };
}
