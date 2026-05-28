import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useCallback } from "react";
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
  Banner,
  Badge,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { writeSidebarMetafield } from "../metafields.server";

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

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { shop: session.shop },
    include: {
      navigationMode: true,
      collections: { where: { enabled: true }, orderBy: { sortOrder: "asc" } },
    },
  });

  const navMode = shop?.navigationMode ?? null;
  const collectionCount = shop?.collections?.length ?? 0;
  const nestedCount = shop?.collections?.filter((c) => c.parentCollectionId).length ?? 0;

  return json({
    currentMode: navMode?.mode ?? "manual",
    autoSettings: parseAutoSettings(navMode?.settingsJson ?? "{}"),
    collectionCount,
    nestedCount,
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const shop = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  const mode = formData.get("mode");
  const settingsJson = JSON.stringify({
    autoShowChildren: formData.get("autoShowChildren") === "true",
    autoShowSiblings: formData.get("autoShowSiblings") === "true",
    fallbackToDefault: formData.get("fallbackToDefault") === "true",
  });

  await prisma.navigationMode.upsert({
    where: { shopId: shop.id },
    update: { mode, settingsJson },
    create: { shopId: shop.id, mode, settingsJson },
  });

  await writeSidebarMetafield(admin, session.shop);
  return json({ success: true });
};

export default function AutoModePage() {
  const { currentMode, autoSettings, collectionCount, nestedCount } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isLoading = navigation.state === "submitting";

  const [mode, setMode] = useState([currentMode]);
  const [autoShowChildren, setAutoShowChildren] = useState(autoSettings.autoShowChildren);
  const [autoShowSiblings, setAutoShowSiblings] = useState(autoSettings.autoShowSiblings);
  const [fallbackToDefault, setFallbackToDefault] = useState(autoSettings.fallbackToDefault);

  const handleSave = useCallback(() => {
    const fd = new FormData();
    fd.append("mode", mode[0]);
    fd.append("autoShowChildren", String(autoShowChildren));
    fd.append("autoShowSiblings", String(autoShowSiblings));
    fd.append("fallbackToDefault", String(fallbackToDefault));
    submit(fd, { method: "post" });
    shopify.toast.show("Navigation mode saved!");
  }, [mode, autoShowChildren, autoShowSiblings, fallbackToDefault, submit, shopify]);

  const isAuto = mode[0] === "automatic";

  return (
    <Page
      title="Navigation Mode"
      subtitle="Choose between manual and automatic sidebar navigation"
      primaryAction={{
        content: "Save Mode",
        onAction: handleSave,
        loading: isLoading,
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">

            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">Mode Selection</Text>
                  <Badge tone={isAuto ? "info" : "success"}>
                    {isAuto ? "Automatic" : "Manual"}
                  </Badge>
                </InlineStack>
                <Divider />

                <ChoiceList
                  title="Navigation Mode"
                  titleHidden
                  choices={[
                    {
                      label: "Manual Navigation",
                      value: "manual",
                      helpText:
                        "You control exactly which collections and products appear in the sidebar — with custom order, images, and labels.",
                    },
                    {
                      label: "Automatic Navigation",
                      value: "automatic",
                      helpText:
                        "The sidebar automatically shows relevant collections based on the page the visitor is currently on.",
                    },
                  ]}
                  selected={mode}
                  onChange={setMode}
                />
              </BlockStack>
            </Card>

            {isAuto && (
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Automatic Rules</Text>
                  <Divider />

                  {nestedCount === 0 && (
                    <Banner tone="warning">
                      No nested (child) collections are configured. Automatic mode works best when
                      you have parent → child collection relationships set up in Collections.
                    </Banner>
                  )}

                  <Text variant="bodySm" as="p" tone="subdued">
                    These rules determine what the sidebar shows when automatic mode is active.
                    The sidebar reads your existing parent-child collection hierarchy from the
                    Collections page.
                  </Text>

                  <BlockStack gap="300">
                    <Checkbox
                      label="Show children of current collection"
                      helpText="When a visitor browses /collections/shirts, automatically display its sub-collections (Denim Shirts, Cotton Shirts, etc.) if they exist."
                      checked={autoShowChildren}
                      onChange={setAutoShowChildren}
                    />

                    <Checkbox
                      label="Show siblings when on a sub-collection"
                      helpText="When a visitor is on /collections/denim-shirts, automatically show all other children of the parent collection (Cotton Shirts, Satin Shirts, etc.)."
                      checked={autoShowSiblings}
                      onChange={setAutoShowSiblings}
                    />

                    <Checkbox
                      label="Fall back to default navigation if no match"
                      helpText="If no automatic match is found for the current page, show the full default sidebar instead of hiding it."
                      checked={fallbackToDefault}
                      onChange={setFallbackToDefault}
                    />
                  </BlockStack>
                </BlockStack>
              </Card>
            )}

            {isAuto && (
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">How Automatic Mode Works</Text>
                  <Divider />
                  <Text variant="bodySm" as="p">
                    <strong>On a collection page:</strong> If the collection has child collections
                    configured, those children are shown. If it is itself a child, its siblings are shown.
                  </Text>
                  <Text variant="bodySm" as="p">
                    <strong>On any other page:</strong> Falls back to the default collection list
                    (if fallback is enabled above).
                  </Text>
                  <Text variant="bodySm" as="p">
                    <strong>Manual mappings (Category Nav):</strong> When automatic mode is active,
                    the Category Nav mappings are not used. Switch to Manual mode to use them.
                  </Text>
                  <Divider />
                  <InlineStack gap="400">
                    <Text variant="bodySm" tone="subdued">
                      Collections in sidebar: <strong>{collectionCount}</strong>
                    </Text>
                    <Text variant="bodySm" tone="subdued">
                      Nested collections: <strong>{nestedCount}</strong>
                    </Text>
                  </InlineStack>
                </BlockStack>
              </Card>
            )}

            {!isAuto && (
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Manual Mode Active</Text>
                  <Divider />
                  <Text variant="bodySm" as="p">
                    The sidebar displays the collections and products you have configured in the{" "}
                    <strong>Collections</strong>, <strong>Products</strong>, and{" "}
                    <strong>Category Nav</strong> pages — in the order and with the customizations
                    you set.
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Switch to Automatic mode to let the sidebar adapt to the current page context
                    without manual mapping setup.
                  </Text>
                </BlockStack>
              </Card>
            )}

          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
