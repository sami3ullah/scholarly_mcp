import type { Entitlements } from '@scholarly-mcp/core';

/**
 * The demo's entitlement adapter (PLAN.md: "Demo uses a mock entitlement adapter"). Open
 * access articles are open to everyone; the rest need a subscription. Login and purchase both go to the
 * article's DOI link, which resolves to the publisher's page where both are offered, so
 * the mock never invents a URL. Thieme would replace it with its own entitlement service.
 */
export function createMockEntitlements(): Entitlements {
  return {
    check({ doi, isOpenAccess }, signal) {
      if (signal.aborted) return Promise.reject(signal.reason as Error);
      if (isOpenAccess) return Promise.resolve({ status: 'open' });
      const articlePage = `https://doi.org/${doi}`;
      return Promise.resolve({
        status: 'subscription',
        loginUrl: articlePage,
        purchaseUrl: articlePage,
      });
    },
  };
}
