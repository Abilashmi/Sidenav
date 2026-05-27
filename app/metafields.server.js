import { buildSidebarPayload } from "./sidebar-data.server";

const SHOP_ID_QUERY = `query { shop { id } }`;

const METAFIELDS_SET = `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

/**
 * Writes the full sidebar data JSON to a shop metafield (fsn.data).
 * The storefront Liquid block reads this metafield and embeds it inline,
 * so the sidebar JS renders with zero HTTP requests — no proxy needed.
 */
export async function writeSidebarMetafield(admin, shopDomain) {
  try {
    const shopRes = await admin.graphql(SHOP_ID_QUERY);
    const shopJson = await shopRes.json();
    const shopGid = shopJson?.data?.shop?.id;
    if (!shopGid) {
      console.error("[FSN] Could not retrieve shop GID for metafield write.");
      return;
    }

    const data = await buildSidebarPayload(shopDomain);
    if (!data) return;

    const res = await admin.graphql(METAFIELDS_SET, {
      variables: {
        metafields: [
          {
            ownerId: shopGid,
            namespace: "fsn",
            key: "data",
            type: "json",
            value: JSON.stringify(data),
          },
        ],
      },
    });

    const result = await res.json();
    const errors = result?.data?.metafieldsSet?.userErrors ?? [];
    if (errors.length > 0) {
      console.error("[FSN] Metafield write errors:", JSON.stringify(errors));
    }
  } catch (err) {
    console.error("[FSN] Failed to write sidebar metafield:", err);
  }
}
