/**
 * Domain handlers index
 *
 * Lazy-loads domain handlers to avoid loading everything upfront.
 */

import type { DomainHandler } from "../utils/types.js";
import type { DomainName } from "../utils/types.js";

// Cache for loaded domain handlers
const domainCache = new Map<DomainName, DomainHandler>();

/**
 * Lazy-load a domain handler
 */
export async function getDomainHandler(
  domain: DomainName
): Promise<DomainHandler> {
  const cached = domainCache.get(domain);
  if (cached) {
    return cached;
  }

  let handler: DomainHandler;

  switch (domain) {
    case "quarantine": {
      const { quarantineHandler } = await import("./quarantine.js");
      handler = quarantineHandler;
      break;
    }
    case "threats": {
      const { threatsHandler } = await import("./threats.js");
      handler = threatsHandler;
      break;
    }
    case "events": {
      const { eventsHandler } = await import("./events.js");
      handler = eventsHandler;
      break;
    }
    case "policies": {
      const { policiesHandler } = await import("./policies.js");
      handler = policiesHandler;
      break;
    }
    case "users": {
      const { usersHandler } = await import("./users.js");
      handler = usersHandler;
      break;
    }
    case "reports": {
      const { reportsHandler } = await import("./reports.js");
      handler = reportsHandler;
      break;
    }
    case "incidents": {
      const { incidentsHandler } = await import("./incidents.js");
      handler = incidentsHandler;
      break;
    }
    case "banners": {
      const { bannersHandler } = await import("./banners.js");
      handler = bannersHandler;
      break;
    }
    case "saas": {
      const { saasHandler } = await import("./saas.js");
      handler = saasHandler;
      break;
    }
    default:
      throw new Error(`Unknown domain: ${domain}`);
  }

  domainCache.set(domain, handler);
  return handler;
}

/**
 * Get all available domain names
 */
export function getAvailableDomains(): DomainName[] {
  return [
    "quarantine",
    "threats",
    "events",
    "policies",
    "users",
    "reports",
    "incidents",
    "banners",
    "saas",
  ];
}

/**
 * Clear the domain cache (useful for testing)
 */
export function clearDomainCache(): void {
  domainCache.clear();
}
