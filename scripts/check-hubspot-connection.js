import { getHubSpotClient } from "../src/hubspot/client.js";
import { logger } from "../src/utils/logger.js";

/**
 * Connectivity check: authenticates against the HubSpot Private App token
 * and confirms the required object scopes are usable by issuing a minimal,
 * read-only request per object type. Logs only counts/ids, never secrets.
 */
async function main() {
  let client;
  try {
    client = getHubSpotClient();
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      "HubSpot client could not be initialized. Set HUBSPOT_ACCESS_TOKEN in your .env file.",
    );
    process.exitCode = 1;
    return;
  }

  try {
    const account = await client.request("GET", "/account-info/v3/details");
    logger.info(
      { portalId: account.portalId, timeZone: account.timeZone, companyCurrency: account.companyCurrency },
      "HubSpot authentication OK",
    );
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, "HubSpot authentication FAILED");
    process.exitCode = 1;
    return;
  }

  const objectTypesToVerify = ["contacts", "companies", "products", "orders", "line_items"];
  let failures = 0;

  for (const objectType of objectTypesToVerify) {
    try {
      const result = await client.request("GET", `/crm/v3/objects/${objectType}?limit=1`);
      logger.info(
        { objectType, sampleCount: result.results?.length ?? 0 },
        "HubSpot object scope OK",
      );
    } catch (error) {
      failures += 1;
      logger.error(
        { objectType, err: error instanceof Error ? error.message : String(error) },
        "HubSpot object scope check FAILED - verify the Private App has read/write access to this object",
      );
    }
  }

  process.exitCode = failures > 0 ? 1 : 0;
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : String(error) }, "Unexpected failure");
  process.exitCode = 1;
});
