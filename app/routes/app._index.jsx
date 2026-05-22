import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  InlineStack,
  BlockStack,
  Text,
  Badge,
  Banner,
  Box,
  Divider,
  Grid,
  Icon,
  Thumbnail,
} from "@shopify/polaris";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  LayoutColumns3Icon,
  SettingsIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import SidebarPreview from "../components/SidebarPreview";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { shop: session.shop },
    include: {
      settings: true,
      collections: {
        where: { enabled: true },
        orderBy: { sortOrder: "asc" },
        take: 5,
      },
    },
  });
  const totalCollections = shop
    ? await prisma.selectedCollection.count({ where: { shopId: shop.id } })
    : 0;
  return json({
    shop: session.shop,
    settings: shop?.settings ?? null,
    topCollections: shop?.collections ?? [],
    totalCollections,
    isEnabled: shop?.settings?.enabled ?? false,
  });
};

export default function Dashboard() {
  const { shop, settings, topCollections, totalCollections, isEnabled } =
    useLoaderData();
  const navigate = useNavigate();

  return (
    <Page
      title="Floating Side Navigation"
      subtitle="Boost your store's navigation with a floating sidebar"
      primaryAction={{
        content: "Manage Collections",
        onAction: () => navigate("/app/collections"),
      }}
      secondaryActions={[
        {
          content: "Settings",
          onAction: () => navigate("/app/settings"),
        },
      ]}
    >
      <BlockStack gap="500">
        {!isEnabled && (
          <Banner
            title="Your sidebar is currently disabled"
            tone="warning"
            action={{ content: "Enable Now", onAction: () => navigate("/app/settings") }}
          >
            <p>Enable the floating sidebar to start showing collections to your customers.</p>
          </Banner>
        )}

        {/* Status Cards */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 4, xl: 4 }}>
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text variant="headingSm" as="h3" tone="subdued">Sidebar Status</Text>
                  <Icon source={isEnabled ? CheckCircleIcon : AlertCircleIcon} tone={isEnabled ? "success" : "caution"} />
                </InlineStack>
                <InlineStack gap="200" align="start">
                  <Badge tone={isEnabled ? "success" : "attention"}>
                    {isEnabled ? "Active" : "Inactive"}
                  </Badge>
                </InlineStack>
                <Text variant="bodySm" as="p" tone="subdued">
                  {isEnabled ? "Sidebar is live on your storefront" : "Enable in Settings"}
                </Text>
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 4, xl: 4 }}>
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text variant="headingSm" as="h3" tone="subdued">Collections</Text>
                  <Icon source={LayoutColumns3Icon} tone="base" />
                </InlineStack>
                <Text variant="headingXl" as="p">{totalCollections}</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Collections in sidebar
                </Text>
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 4, xl: 4 }}>
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text variant="headingSm" as="h3" tone="subdued">Position</Text>
                  <Icon source={SettingsIcon} tone="base" />
                </InlineStack>
                <Text variant="headingXl" as="p" textTransform="capitalize">
                  {settings?.position ?? "Left"}
                </Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Sidebar placement on screen
                </Text>
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>

        <Layout>
          {/* Live Preview */}
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Sidebar Preview</Text>
                <Divider />
                <SidebarPreview
                  settings={settings}
                  collections={topCollections}
                />
                <Text variant="bodySm" as="p" tone="subdued">
                  This is how your sidebar looks on the storefront.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Quick Actions */}
          <Layout.Section variant="oneHalf">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Quick Actions</Text>
                  <Divider />
                  <BlockStack gap="300">
                    <Button
                      fullWidth
                      size="large"
                      variant="primary"
                      onClick={() => navigate("/app/collections")}
                      icon={LayoutColumns3Icon}
                    >
                      Manage Collections
                    </Button>
                    <Button
                      fullWidth
                      size="large"
                      onClick={() => navigate("/app/settings")}
                      icon={SettingsIcon}
                    >
                      Customize Sidebar
                    </Button>
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Recent Collections</Text>
                  <Divider />
                  {topCollections.length === 0 ? (
                    <Box padding="400">
                      <BlockStack gap="200" align="center" inlineAlign="center">
                        <Icon source={LayoutColumns3Icon} tone="subdued" />
                        <Text variant="bodySm" tone="subdued" as="p">
                          No collections added yet.
                        </Text>
                        <Button onClick={() => navigate("/app/collections")} size="slim">
                          Add Collections
                        </Button>
                      </BlockStack>
                    </Box>
                  ) : (
                    <BlockStack gap="300">
                      {topCollections.map((col) => (
                        <InlineStack key={col.id} gap="300" align="start" blockAlign="center">
                          <Thumbnail
                            source={col.image || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1.png"}
                            alt={col.title}
                            size="small"
                          />
                          <BlockStack gap="050">
                            <Text variant="bodyMd" as="p" fontWeight="semibold">{col.title}</Text>
                            <Text variant="bodySm" as="p" tone="subdued">/{col.handle}</Text>
                          </BlockStack>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>

        {/* Setup Guide */}
        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">Setup Guide</Text>
            <Divider />
            <Grid>
              <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Box
                      background="bg-fill-success"
                      borderRadius="full"
                      padding="100"
                    >
                      <Text variant="bodySm" tone="success" as="span" fontWeight="bold">1</Text>
                    </Box>
                    <Text variant="bodyMd" as="p" fontWeight="semibold">Install App Embed</Text>
                  </InlineStack>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Enable the app embed in your theme editor to display the sidebar.
                  </Text>
                </BlockStack>
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Box
                      background={totalCollections > 0 ? "bg-fill-success" : "bg-fill-caution"}
                      borderRadius="full"
                      padding="100"
                    >
                      <Text variant="bodySm" as="span" fontWeight="bold">2</Text>
                    </Box>
                    <Text variant="bodyMd" as="p" fontWeight="semibold">Add Collections</Text>
                  </InlineStack>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Select which collections to show in your floating sidebar.
                  </Text>
                </BlockStack>
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Box
                      background={isEnabled ? "bg-fill-success" : "bg-fill-caution"}
                      borderRadius="full"
                      padding="100"
                    >
                      <Text variant="bodySm" as="span" fontWeight="bold">3</Text>
                    </Box>
                    <Text variant="bodyMd" as="p" fontWeight="semibold">Enable & Customize</Text>
                  </InlineStack>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Enable the sidebar and customize colors, position, and more.
                  </Text>
                </BlockStack>
              </Grid.Cell>
            </Grid>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
