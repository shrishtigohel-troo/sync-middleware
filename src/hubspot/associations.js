import { getHubSpotClient } from "./client.js";

/**
 * HubSpot's default association type IDs for standard object pairs
 * (v4 Associations API). Custom/labeled association types are looked up
 * dynamically and are not hardcoded here.
 * Reference: https://developers.hubspot.com/docs/api/crm/associations
 */
export const DEFAULT_ASSOCIATION_TYPES = {
  CONTACT_TO_COMPANY: 1,
  COMPANY_TO_CONTACT: 2,
};

/**
 * Associates a single record pair via the v4 Associations API.
 * Idempotent: HubSpot upserts the association rather than duplicating it
 * when called repeatedly with the same object pair and type.
 *
 * associations: [{ associationCategory: "HUBSPOT_DEFINED" | "USER_DEFINED", associationTypeId: number }]
 */
export async function associateRecords(fromObjectType, fromObjectId, toObjectType, toObjectId, associations) {
  const client = getHubSpotClient();
  await client.request(
    "PUT",
    `/crm/v4/objects/${fromObjectType}/${fromObjectId}/associations/${toObjectType}/${toObjectId}`,
    associations,
  );
}

/** Removes every association between two records (all labels/types). */
export async function removeAssociation(fromObjectType, fromObjectId, toObjectType, toObjectId) {
  const client = getHubSpotClient();
  await client.request("DELETE", `/crm/v4/objects/${fromObjectType}/${fromObjectId}/associations/${toObjectType}/${toObjectId}`);
}

/**
 * Lists the ids of every record of `toObjectType` associated with one
 * record. Unlike the CRM Search API this is strongly consistent, so a
 * record associated a second ago is already returned - see the line item
 * matching in src/middleware/webhookRouter.js.
 */
export async function listAssociatedObjectIds(fromObjectType, fromObjectId, toObjectType) {
  const client = getHubSpotClient();
  const ids = [];
  let after;
  do {
    const qs = after ? `?limit=500&after=${after}` : "?limit=500";
    const data = await client.request(
      "GET",
      `/crm/v4/objects/${fromObjectType}/${fromObjectId}/associations/${toObjectType}${qs}`,
    );
    for (const result of data.results ?? []) ids.push(String(result.toObjectId));
    after = data.paging?.next?.after;
  } while (after);
  return ids;
}

/**
 * Looks up the real association type IDs HubSpot has defined between two
 * object types, rather than hardcoding a guessed numeric ID (which would
 * silently point at the wrong association if wrong). Callers should pick
 * the HUBSPOT_DEFINED, unlabeled entry for a plain "default" association.
 */
export async function listAssociationLabels(fromObjectType, toObjectType) {
  const client = getHubSpotClient();
  const data = await client.request("GET", `/crm/v4/associations/${fromObjectType}/${toObjectType}/labels`);
  return data.results;
}

/**
 * Convenience helper: finds the default (unlabeled, HubSpot-defined)
 * association type between two object types, or undefined if none exists
 * yet - callers must not guess a type ID when this returns undefined.
 */
export async function getDefaultAssociationType(fromObjectType, toObjectType) {
  const labels = await listAssociationLabels(fromObjectType, toObjectType);
  const defaultLabel = labels.find((l) => l.category === "HUBSPOT_DEFINED");
  if (!defaultLabel) return undefined;
  return { associationCategory: "HUBSPOT_DEFINED", associationTypeId: defaultLabel.typeId };
}

export async function batchAssociateRecords(fromObjectType, toObjectType, inputs) {
  const client = getHubSpotClient();
  await client.request("POST", `/crm/v4/associations/${fromObjectType}/${toObjectType}/batch/create`, {
    inputs: inputs.map(({ fromId, toId, associations }) => ({
      from: { id: fromId },
      to: { id: toId },
      types: associations,
    })),
  });
}
