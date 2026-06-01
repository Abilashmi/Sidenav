import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link } from "@remix-run/react";
import { useState, useCallback, useMemo } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Divider,
  ChoiceList,
  Checkbox,
  Badge,
  Box,
  Banner,
  List,
  Icon,
  EmptyState,
  Select,
} from "@shopify/polaris";
import {
  RefreshIcon,
  CollectionListIcon,
  ViewIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  InfoIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { writeSidebarMetafield } from "../metafields.server";
import SidebarPreview from "../components/SidebarPreview";

const DEFAULT_AUTO_SETTINGS = {
  autoShowChildren: true,
  autoShowSiblings: true,
  fallbackToDefault: true,
};

function parseAutoSettings(json) {
  try {
    return { ...DEFAULT_AUTO_SETTINGS, ...JSON.parse(json) };
  } catch {
    return { ...DEFAULT_AUTO_SETTINGS };
  }
}

const COLLECTIONS_QUERY = `
  query GetCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { id title handle image { url } } }
    }
  }
`;

async function fetchAllShopifyCollections(admin) {
  const results = [];
  let cursor = null;
  let hasMore = true;
  while (hasMore) {
    const res = await admin.graphql(COLLECTIONS_QUERY, { variables: { first: 50, after: cursor } });
    const data = await res.json();
    const edges = data?.data?.collections?.edges ?? [];
    results.push(...edges.map((e) => ({
      id: e.node.id, title: e.node.title,
      handle: e.node.handle, image: e.node.image?.url ?? null,
    })));
    hasMore = data?.data?.collections?.pageInfo?.hasNextPage ?? false;
    cursor  = data?.data?.collections?.pageInfo?.endCursor ?? null;
  }
  return results;
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { shop: session.shop },
    include: {
      settings: true,
      navigationMode: true,
      collections: { where: { enabled: true }, orderBy: { sortOrder: "asc" }, take: 8 },
      products: { where: { enabled: true }, orderBy: { sortOrder: "asc" }, take: 4 },
      _count: {
        select: { mappings: true }
      }
    },
  });

  const navMode = shop?.navigationMode ?? null;
  return json({
    currentMode:     navMode?.mode ?? "manual",
    autoSettings:    parseAutoSettings(navMode?.settingsJson ?? "{}"),
    collectionCount: await prisma.selectedCollection.count({ where: { shopId: shop?.id } }),
    mappingCount:    shop?._count?.mappings ?? 0,
    settings:        shop?.settings ?? null,
    previewCollections: shop?.collections ?? [],
    previewProducts:    shop?.products ?? [],
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent   = formData.get("intent");
  const shop     = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  if (intent === "save-mode") {
    const mode        = formData.get("mode");
    const settingsJson = JSON.stringify({
      autoShowChildren:  formData.get("autoShowChildren")  === "true",
      autoShowSiblings:  formData.get("autoShowSiblings")  === "true",
      fallbackToDefault: formData.get("fallbackToDefault") === "true",
    });
    await prisma.navigationMode.upsert({
      where:  { shopId: shop.id },
      update: { mode, settingsJson },
      create: { shopId: shop.id, mode, settingsJson },
    });
    await writeSidebarMetafield(admin, session.shop);
    return json({ success: true });
  }

  if (intent === "sync-collections") {
    const shopifyCollections = await fetchAllShopifyCollections(admin);
    for (let i = 0; i < shopifyCollections.length; i++) {
      const c            = shopifyCollections[i];
      const collectionId = c.id.replace("gid://shopify/Collection/", "");
      const existing     = await prisma.selectedCollection.findUnique({
        where: { shopId_collectionId: { shopId: shop.id, collectionId } },
      });
      if (existing) {
        await prisma.selectedCollection.update({
          where: { shopId_collectionId: { shopId: shop.id, collectionId } },
          data:  { title: c.title, handle: c.handle, image: c.image, enabled: true },
        });
      } else {
        await prisma.selectedCollection.create({
          data: { shopId: shop.id, collectionId, title: c.title, handle: c.handle, image: c.image, sortOrder: i, enabled: true },
        });
      }
    }
    await prisma.navigationMode.upsert({
      where:  { shopId: shop.id },
      update: { mode: "automatic" },
      create: { shopId: shop.id, mode: "automatic", settingsJson: "{}" },
    });
    await writeSidebarMetafield(admin, session.shop);
    return json({ success: true, total: shopifyCollections.length });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function AutoModePage() {
  const {
    currentMode,
    autoSettings,
    collectionCount,
    mappingCount,
    settings,
    previewCollections,
    previewProducts,
  } = useLoaderData();
  const submit     = useSubmit();
  const navigation = useNavigation();
  const shopify    = useAppBridge();

  const pendingIntent = navigation.formData?.get("intent");
  const isSaving  = navigation.state === "submitting" && pendingIntent === "save-mode";
  const isSyncing = navigation.state === "submitting" && pendingIntent === "sync-collections";

  const [mode, setMode]                           = useState([currentMode]);
  const [autoShowChildren, setAutoShowChildren]   = useState(autoSettings.autoShowChildren);
  const [autoShowSiblings, setAutoShowSiblings]   = useState(autoSettings.autoShowSiblings);
  const [fallbackToDefault, setFallbackToDefault] = useState(autoSettings.fallbackToDefault);

  // Simulated Page State for Preview
  const [simulatedPage, setSimulatedPage] = useState("home"); // home | collection | subcategory

  const handleSave = useCallback(() => {
    const fd = new FormData();
    fd.append("intent",            "save-mode");
    fd.append("mode",              mode[0]);
    fd.append("autoShowChildren",  String(autoShowChildren));
    fd.append("autoShowSiblings",  String(autoShowSiblings));
    fd.append("fallbackToDefault", String(fallbackToDefault));
    submit(fd, { method: "post" });
    shopify.toast.show("Settings saved");
  }, [mode, autoShowChildren, autoShowSiblings, fallbackToDefault, submit, shopify]);

  const handleSync = useCallback(() => {
    const fd = new FormData();
    fd.append("intent", "sync-collections");
    submit(fd, { method: "post" });
    shopify.toast.show("Syncing collections…");
  }, [submit, shopify]);

  const isAuto = mode[0] === "automatic";

  // Compute preview collections based on simulated page and rules
  const displayCollections = useMemo(() => {
    if (!isAuto) return previewCollections;

    if (simulatedPage === "home") {
      return fallbackToDefault ? previewCollections : [];
    }

    if (simulatedPage === "collection") {
      // Simulate showing children (if any)
      if (autoShowChildren && previewCollections.length > 2) {
        return previewCollections.slice(0, 3).map((c, i) => ({ ...c, title: "Sub-" + c.title }));
      }
      return fallbackToDefault ? previewCollections : [];
    }

    if (simulatedPage === "subcategory") {
      // Simulate showing siblings
      if (autoShowSiblings && previewCollections.length > 2) {
        return previewCollections.slice(3, 6);
      }
      return fallbackToDefault ? previewCollections : [];
    }

    return previewCollections;
  }, [isAuto, simulatedPage, previewCollections, autoShowChildren, autoShowSiblings, fallbackToDefault]);

  return (
    <Page
      fullWidth
      primaryAction={{ content: "Save Changes", onAction: handleSave, loading: isSaving }}
    >
      <BlockStack gap="400">
        <Layout>
          {/* LEFT COLUMN — Mode & Hierarchy */}
          <Layout.Section>
            <BlockStack gap="400">

              {/* Page Title Card (Replacing Page Header) */}
              <Card>
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text variant="headingLg" as="h1">Navigation Mode</Text>
                    <Text variant="bodySm" tone="subdued">Control how your sidebar items are populated</Text>
                  </BlockStack>
                </InlineStack>
              </Card>

              {/* Mode Selection */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h2">Navigation Mode</Text>
                    <Badge tone={isAuto ? "info" : "success"}>
                      {isAuto ? "Automatic" : "Manual"}
                    </Badge>
                  </InlineStack>
                  <Divider />
                  <Box paddingBlockStart="200">
                    <ChoiceList
                      title="Select how you want to manage your sidebar:"
                      titleHidden
                      choices={[
                        {
                          label: "Manual Mode",
                          value: "manual",
                          helpText: "Hand-pick collections and products from their respective pages. Best for custom-tailored sidebars.",
                        },
                        {
                          label: "Automatic Mode",
                          value: "automatic",
                          helpText: "Sync your entire catalog. The sidebar dynamically shows sub-categories based on the customer's current page.",
                        },
                      ]}
                      selected={mode}
                      onChange={setMode}
                    />
                  </Box>
                </BlockStack>
              </Card>

              {/* Hierarchy Summary (Only for Auto) */}
              {isAuto && (
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Category Hierarchy</Text>
                    <Divider />
                    <Text variant="bodyMd" as="p">
                      Automatic mode uses your <strong>Category Groups</strong> to decide which sub-collections to show.
                    </Text>
                    <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <Text variant="headingSm" as="h3">{mappingCount} Group{mappingCount !== 1 ? "s" : ""} Defined</Text>
                          <Text variant="bodySm" tone="subdued">Nested collections found in your mapping</Text>
                        </BlockStack>
                        <Button url="/app/mappings">Manage Hierarchy</Button>
                      </InlineStack>
                    </Box>
                  </BlockStack>
                </Card>
              )}

              {!isAuto && (
                <Card>
                  <EmptyState
                    heading="Manual Mode is Active"
                    action={{ content: "Manage Collections", url: "/app/collections" }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    fullWidth
                  >
                    <p>You are currently hand-picking items. Switch to Automatic to let the sidebar adapt dynamically to your collections.</p>
                  </EmptyState>
                </Card>
              )}
            </BlockStack>
          </Layout.Section>

          {/* RIGHT COLUMN — Preview (Top), then Sync & Rules */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">

              {/* Live Preview (Sticky & Top) */}
              <div style={{ position: "sticky", top: "20px", zIndex: 10 }}>
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd" as="h2">Live Preview</Text>
                      <Badge tone="info">Live</Badge>
                    </InlineStack>
                    <Divider />

                    {isAuto && (
                      <Select
                        label="Preview Page Type:"
                        options={[
                          { label: "Home Page", value: "home" },
                          { label: "Parent Collection", value: "collection" },
                          { label: "Sub-category Page", value: "subcategory" },
                        ]}
                        value={simulatedPage}
                        onChange={setSimulatedPage}
                      />
                    )}

                    <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                      <SidebarPreview
                        settings={settings || {}}
                        collections={displayCollections}
                        products={previewProducts}
                      />
                    </Box>
                  </BlockStack>
                </Card>
              </div>

              {/* Sync & Rules (Consolidated for space) */}
              {isAuto && (
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Configuration</Text>
                    <Divider />

                    {/* Sync Section */}
                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="bodyMd" fontWeight="semibold">Sync Catalog</Text>
                        <Button 
                          variant="plain" 
                          onClick={handleSync} 
                          loading={isSyncing}
                          icon={RefreshIcon}
                        >
                          Sync Now
                        </Button>
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued">
                        {collectionCount > 0 
                          ? `${collectionCount} collections imported.` 
                          : "No collections found."}
                      </Text>
                    </BlockStack>

                    <Divider />

                    {/* Rules Section */}
                    <BlockStack gap="200">
                      <Text variant="bodyMd" fontWeight="semibold">Display Logic</Text>
                      <Checkbox
                        label="Show sub-categories"
                        checked={autoShowChildren}
                        onChange={setAutoShowChildren}
                      />
                      <Checkbox
                        label="Show sibling categories"
                        checked={autoShowSiblings}
                        onChange={setAutoShowSiblings}
                      />
                      <Checkbox
                        label="Fallback to main list"
                        checked={fallbackToDefault}
                        onChange={setFallbackToDefault}
                      />
                    </BlockStack>
                  </BlockStack>
                </Card>
              )}

            </BlockStack>
          </Layout.Section>        </Layout>
      </BlockStack>
    </Page>
  );
  }

