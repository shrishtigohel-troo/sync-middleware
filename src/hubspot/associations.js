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
