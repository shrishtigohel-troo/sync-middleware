import { getHubSpotClient } from "./client.js";

/**
 * Lists the property definitions that actually exist on a HubSpot object
 * type right now. Used to verify configuration before writing, rather than
 * assuming a custom property (e.g. shopify_product_id) has been created -
 * see docs/field-mapping.md for the properties this middleware expects.
 */
export async function listObjectProperties(objectType) {
  const client = getHubSpotClient();
  const data = await client.request("GET", `/crm/v3/properties/${objectType}`);
  return data.results;
}

export async function getExistingPropertyNames(objectType) {
  const properties = await listObjectProperties(objectType);
  return new Set(properties.map((p) => p.name));
}
