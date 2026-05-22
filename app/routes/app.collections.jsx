import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useCallback } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Page,
  Layout,
  Card,
  Button,
  IndexTable,
  Thumbnail,
  Text,
  Badge,
  InlineStack,
  BlockStack,
  Modal,
  Checkbox,
  Banner,
  EmptyState,
  Spinner,
  Divider,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const COLLECTIONS_QUERY = `
  query GetCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          handle
          image { url altText }
          productsCount { count }
        }
      }
    }
  }
`;

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { shop: session.shop },
    include: {
      collections: { orderBy: { sortOrder: "asc" } },
    },
  });
  let allShopifyCollections = [];
  let cursor = null;
  let hasMore = true;
  while (hasMore) {
    const response = await admin.graphql(COLLECTIONS_QUERY, {
      variables: { first: 50, after: cursor },
    });
    const data = await response.json();
    const edges = data?.data?.collections?.edges ?? [];
    allShopifyCollections.push(
      ...edges.map((e) => ({
        id: e.node.id,
        title: e.node.title,
        handle: e.node.handle,
        image: e.node.image?.url ?? null,
        productsCount: e.node.productsCount?.count ?? 0,
      }))
    );
    hasMore = data?.data?.collections?.pageInfo?.hasNextPage ?? false;
    cursor = data?.data?.collections?.pageInfo?.endCursor ?? null;
  }
  return json({
    shopifyCollections: allShopifyCollections,
    savedCollections: shop?.collections ?? [],
    shopId: shop?.id ?? null,
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const shop = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  if (intent === "save") {
    const collectionsJson = formData.get("collections");
    const collections = JSON.parse(collectionsJson);
    await prisma.$transaction(async (tx) => {
      await tx.selectedCollection.deleteMany({ where: { shopId: shop.id } });
      if (collections.length > 0) {
        await tx.selectedCollection.createMany({
          data: collections.map((col, idx) => ({
            shopId: shop.id,
            collectionId: col.id,
            title: col.title,
            handle: col.handle,
            image: col.image,
            sortOrder: idx,
            enabled: col.enabled ?? true,
          })),
        });
      }
    });
    return json({ success: true });
  }

  if (intent === "toggle") {
    const collectionId = formData.get("collectionId");
    const enabled = formData.get("enabled") === "true";
    await prisma.selectedCollection.update({
      where: {
        shopId_collectionId: { shopId: shop.id, collectionId },
      },
      data: { enabled },
    });
    return json({ success: true });
  }

  if (intent === "remove") {
    const collectionId = formData.get("collectionId");
    await prisma.selectedCollection.delete({
      where: { shopId_collectionId: { shopId: shop.id, collectionId } },
    });
    return json({ success: true });
  }

  if (intent === "reorder") {
    const collectionId = formData.get("collectionId");
    const direction = formData.get("direction");
    const all = await prisma.selectedCollection.findMany({
      where: { shopId: shop.id },
      orderBy: { sortOrder: "asc" },
    });
    const idx = all.findIndex((c) => c.collectionId === collectionId);
    if (idx === -1) return json({ success: true });
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= all.length) return json({ success: true });
    await prisma.$transaction([
      prisma.selectedCollection.update({
        where: { shopId_collectionId: { shopId: shop.id, collectionId: all[idx].collectionId } },
        data: { sortOrder: all[targetIdx].sortOrder },
      }),
      prisma.selectedCollection.update({
        where: { shopId_collectionId: { shopId: shop.id, collectionId: all[targetIdx].collectionId } },
        data: { sortOrder: all[idx].sortOrder },
      }),
    ]);
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function CollectionsPage() {
  const { shopifyCollections, savedCollections } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isLoading = navigation.state === "submitting";

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(
    new Set(savedCollections.map((c) => c.collectionId))
  );

  const handleToggleModal = useCallback(() => setModalOpen((v) => !v), []);

  const handleCheckboxChange = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    const selected = shopifyCollections
      .filter((c) => selectedIds.has(c.id))
      .map((c, i) => ({ ...c, enabled: true, sortOrder: i }));
    const formData = new FormData();
    formData.append("intent", "save");
    formData.append("collections", JSON.stringify(selected));
    submit(formData, { method: "post" });
    setModalOpen(false);
    shopify.toast.show("Collections saved!");
  }, [selectedIds, shopifyCollections, submit, shopify]);

  const handleRemove = useCallback((collectionId) => {
    const formData = new FormData();
    formData.append("intent", "remove");
    formData.append("collectionId", collectionId);
    submit(formData, { method: "post" });
    shopify.toast.show("Collection removed");
  }, [submit, shopify]);

  const handleToggleEnabled = useCallback((collectionId, enabled) => {
    const formData = new FormData();
    formData.append("intent", "toggle");
    formData.append("collectionId", collectionId);
    formData.append("enabled", String(!enabled));
    submit(formData, { method: "post" });
  }, [submit]);

  const handleReorder = useCallback((collectionId, direction) => {
    const formData = new FormData();
    formData.append("intent", "reorder");
    formData.append("collectionId", collectionId);
    formData.append("direction", direction);
    submit(formData, { method: "post" });
  }, [submit]);

  const rowMarkup = savedCollections.map((col, index) => (
    <IndexTable.Row id={col.id} key={col.id} position={index}>
      <IndexTable.Cell>
        <InlineStack gap="300" blockAlign="center">
          <Thumbnail
            source={col.image || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1.png"}
            alt={col.title}
            size="small"
          />
          <BlockStack gap="050">
            <Text variant="bodyMd" fontWeight="semibold" as="span">{col.title}</Text>
            <Text variant="bodySm" tone="subdued" as="span">/{col.handle}</Text>
          </BlockStack>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodySm" as="span">{index + 1}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={col.enabled ? "success" : "attention"}>
          {col.enabled ? "Visible" : "Hidden"}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200">
          <Button
            size="slim"
            disabled={index === 0}
            onClick={() => handleReorder(col.collectionId, "up")}
          >
            ↑
          </Button>
          <Button
            size="slim"
            disabled={index === savedCollections.length - 1}
            onClick={() => handleReorder(col.collectionId, "down")}
          >
            ↓
          </Button>
          <Button
            size="slim"
            onClick={() => handleToggleEnabled(col.collectionId, col.enabled)}
          >
            {col.enabled ? "Hide" : "Show"}
          </Button>
          <Button
            size="slim"
            tone="critical"
            onClick={() => handleRemove(col.collectionId)}
          >
            Remove
          </Button>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
        title="Collections"
        subtitle="Select collections to display in your floating sidebar"
        primaryAction={{
          content: "Add Collections",
          onAction: handleToggleModal,
        }}
      >
        <BlockStack gap="400">
          <Banner tone="info">
            <p>
              Select collections to show in your storefront sidebar. Use the ↑ ↓ buttons to reorder them.
            </p>
          </Banner>

          <Card>
            {savedCollections.length === 0 ? (
              <EmptyState
                heading="No collections added yet"
                action={{ content: "Add Collections", onAction: handleToggleModal }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Add collections to display in your floating sidebar.</p>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={{ singular: "collection", plural: "collections" }}
                itemCount={savedCollections.length}
                headings={[
                  { title: "Collection" },
                  { title: "Order" },
                  { title: "Status" },
                  { title: "Actions" },
                ]}
                selectable={false}
              >
                {rowMarkup}
              </IndexTable>
            )}
          </Card>
        </BlockStack>

        {/* Collection Picker Modal */}
        <Modal
          open={modalOpen}
          onClose={handleToggleModal}
          title="Select Collections"
          primaryAction={{ content: "Save", onAction: handleSave, loading: isLoading }}
          secondaryActions={[{ content: "Cancel", onAction: handleToggleModal }]}
          large
        >
          <Modal.Section>
            {shopifyCollections.length === 0 ? (
              <Box padding="400">
                <InlineStack align="center">
                  <Spinner />
                </InlineStack>
              </Box>
            ) : (
              <BlockStack gap="300">
                <Text variant="bodySm" tone="subdued" as="p">
                  {selectedIds.size} of {shopifyCollections.length} selected
                </Text>
                {shopifyCollections.map((col) => (
                  <Card key={col.id}>
                    <InlineStack gap="400" blockAlign="center" align="space-between">
                      <InlineStack gap="300" blockAlign="center">
                        <Thumbnail
                          source={col.image || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1.png"}
                          alt={col.title}
                          size="small"
                        />
                        <BlockStack gap="050">
                          <Text variant="bodyMd" fontWeight="semibold" as="span">{col.title}</Text>
                          <Text variant="bodySm" tone="subdued" as="span">
                            {col.productsCount} products
                          </Text>
                        </BlockStack>
                      </InlineStack>
                      <Checkbox
                        label=""
                        checked={selectedIds.has(col.id)}
                        onChange={() => handleCheckboxChange(col.id)}
                      />
                    </InlineStack>
                  </Card>
                ))}
              </BlockStack>
            )}
          </Modal.Section>
        </Modal>

      </Page>
  );
}
