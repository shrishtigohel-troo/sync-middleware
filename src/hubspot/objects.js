import { getHubSpotClient, HubSpotApiError } from "./client.js";

/**
 * A HubSpot record: { id, properties, createdAt?, updatedAt?, archived? }
 * A search filter: { propertyName, operator, value? } where operator is one of
 * EQ | NEQ | LT | LTE | GT | GTE | HAS_PROPERTY | NOT_HAS_PROPERTY | CONTAINS_TOKEN
 */

/**
 * Generic CRUD/search/batch wrapper for a single HubSpot CRM object type.
 * Kept generic (rather than one bespoke class per object) so Contacts,
 * Companies, Products, Orders and Line Items all share one, tested code path.
 */
export class HubSpotObjectApi {
  constructor(objectType) {
    this.objectType = objectType;
  }

  async create(properties) {
    const client = getHubSpotClient();
    return client.request("POST", `/crm/v3/objects/${this.objectType}`, { properties });
  }

  async update(id, properties) {
    const client = getHubSpotClient();
    return client.request("PATCH", `/crm/v3/objects/${this.objectType}/${id}`, { properties });
  }

  async getById(id, propertiesToFetch) {
    const client = getHubSpotClient();
    const qs = propertiesToFetch?.length ? `?properties=${propertiesToFetch.join(",")}` : "";
    return client.request("GET", `/crm/v3/objects/${this.objectType}/${id}${qs}`);
  }

  /**
   * Reads one record by a unique-value custom property (e.g.
   * shopify_company_id), returning null if none exists. Unlike
   * searchByFilters (the CRM Search API), this is a direct record lookup -
   * strongly consistent, not subject to the Search API's few-second
   * indexing lag. Prefer this over search for duplicate-prevention checks
   * that can run twice in rapid succession for the same record (e.g. a
   * create webhook immediately followed by an update webhook) - confirmed
   * live: two such webhooks landing ~2 seconds apart both used
   * searchByFilters and both created a new Company, since the first create
   * hadn't been indexed for search yet when the second one checked.
   */
  async getByIdProperty(idProperty, value, propertiesToFetch) {
    const client = getHubSpotClient();
    const qs = propertiesToFetch?.length ? `?properties=${propertiesToFetch.join(",")}` : "";
    try {
      return await client.request(
        "GET",
        `/crm/v3/objects/${this.objectType}/${encodeURIComponent(value)}${qs}${qs ? "&" : "?"}idProperty=${idProperty}`,
      );
    } catch (error) {
      if (error instanceof HubSpotApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Searches by exact-match filters. Used for duplicate-prevention lookups
   * (e.g. find a contact by email, a company by Shopify Company ID, an order
   * by the Shopify Store ID + Shopify Order ID compound key).
   */
  async searchByFilters(filters, propertiesToFetch, limit = 10) {
    return this.searchByFilterGroups([filters], propertiesToFetch, limit);
  }

  /**
   * Searches with OR semantics across multiple filter groups (each group's
   * filters are AND-ed together; a record matching ANY group is returned).
   * Used when a record could be identified by more than one independent key
   * - e.g. an Order might already exist either under our own compound key
   * (shopify_store_id + shopify_order_id) or under HubSpot's native
   * reference field (hs_source_store + hs_external_order_id) if the native
   * Shopify-HubSpot integration created it first - see
   * docs/object-matching-rules.md.
   */
  async searchByFilterGroups(filterGroups, propertiesToFetch, limit = 10) {
    const client = getHubSpotClient();
    return client.request("POST", `/crm/v3/objects/${this.objectType}/search`, {
      filterGroups: filterGroups.map((filters) => ({ filters })),
      properties: propertiesToFetch,
      limit,
    });
  }

  async batchCreate(inputs) {
    const client = getHubSpotClient();
    return client.request("POST", `/crm/v3/objects/${this.objectType}/batch/create`, {
      inputs: inputs.map((properties) => ({ properties })),
    });
  }

  async batchUpdate(inputs) {
    const client = getHubSpotClient();
    return client.request("POST", `/crm/v3/objects/${this.objectType}/batch/update`, { inputs });
  }

  /**
   * Batch upsert keyed on a unique-value property (e.g. shopify_order_id).
   * The property must be configured in HubSpot with "hasUniqueValue: true"
   * before this will work - see docs/object-matching-rules.md.
   */
  async batchUpsert(idProperty, inputs) {
    const client = getHubSpotClient();
    return client.request("POST", `/crm/v3/objects/${this.objectType}/batch/upsert`, {
      inputs: inputs.map(({ idValue, properties }) => ({ idProperty, id: idValue, properties })),
    });
  }
}
