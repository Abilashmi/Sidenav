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
  Badge,
  Modal,
  TextField,
  Select,
  Checkbox,
  ResourceList,
  ResourceItem,
  EmptyState,
  Banner,
  DatePicker,
  Thumbnail,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { writeSidebarMetafield } from "../metafields.server";

const TIMEZONES = [
  { label: "UTC", value: "UTC" },
  { label: "US/Eastern — New York", value: "America/New_York" },
  { label: "US/Central — Chicago", value: "America/Chicago" },
  { label: "US/Mountain — Denver", value: "America/Denver" },
  { label: "US/Pacific — Los Angeles", value: "America/Los_Angeles" },
  { label: "UK/Ireland — London", value: "Europe/London" },
  { label: "Europe/Berlin", value: "Europe/Berlin" },
  { label: "Europe/Paris", value: "Europe/Paris" },
  { label: "India — IST", value: "Asia/Kolkata" },
  { label: "Japan — JST", value: "Asia/Tokyo" },
  { label: "China — CST", value: "Asia/Shanghai" },
  { label: "Australia/Sydney", value: "Australia/Sydney" },
];

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function isLive(schedule) {
  const now = Date.now();
  return (
    now >= new Date(schedule.startDate).getTime() &&
    now <= new Date(schedule.endDate).getTime()
  );
}

function parseIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { shop: session.shop },
    include: {
      schedules: { orderBy: { createdAt: "asc" } },
      collections: { where: { enabled: true }, orderBy: { sortOrder: "asc" } },
      products: { where: { enabled: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  return json({
    schedules: shop?.schedules ?? [],
    collections: shop?.collections ?? [],
    products: shop?.products ?? [],
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const shop = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  if (intent === "create") {
    await prisma.navigationSchedule.create({
      data: {
        shopId: shop.id,
        name: formData.get("name"),
        startDate: new Date(formData.get("startDate")),
        endDate: new Date(formData.get("endDate")),
        timezone: formData.get("timezone") || "UTC",
        collectionIds: formData.get("collectionIds") || "[]",
        productIds: formData.get("productIds") || "[]",
        enabled: formData.get("enabled") === "true",
      },
    });
  } else if (intent === "update") {
    await prisma.navigationSchedule.update({
      where: { id: formData.get("id") },
      data: {
        name: formData.get("name"),
        startDate: new Date(formData.get("startDate")),
        endDate: new Date(formData.get("endDate")),
        timezone: formData.get("timezone") || "UTC",
        collectionIds: formData.get("collectionIds") || "[]",
        productIds: formData.get("productIds") || "[]",
        enabled: formData.get("enabled") === "true",
      },
    });
  } else if (intent === "delete") {
    await prisma.navigationSchedule.delete({ where: { id: formData.get("id") } });
  } else if (intent === "toggle") {
    const s = await prisma.navigationSchedule.findUnique({
      where: { id: formData.get("id") },
    });
    if (s) {
      await prisma.navigationSchedule.update({
        where: { id: formData.get("id") },
        data: { enabled: !s.enabled },
      });
    }
  }

  await writeSidebarMetafield(admin, session.shop);
  return json({ success: true });
};

const TODAY = new Date();
const NEXT_MONTH = new Date(TODAY.getTime() + 30 * 24 * 60 * 60 * 1000);

export default function SchedulePage() {
  const { schedules, collections, products } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isLoading = navigation.state === "submitting";

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [schedEnabled, setSchedEnabled] = useState(true);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState(new Set());
  const [selectedProductIds, setSelectedProductIds] = useState(new Set());
  const [selectedDates, setSelectedDates] = useState({ start: TODAY, end: NEXT_MONTH });
  const [{ month, year }, setMonthYear] = useState({
    month: TODAY.getMonth(),
    year: TODAY.getFullYear(),
  });

  const openAdd = useCallback(() => {
    setEditId(null);
    setName("");
    setTimezone("UTC");
    setSchedEnabled(true);
    setSelectedCollectionIds(new Set());
    setSelectedProductIds(new Set());
    setSelectedDates({ start: TODAY, end: NEXT_MONTH });
    setMonthYear({ month: TODAY.getMonth(), year: TODAY.getFullYear() });
    setShowModal(true);
  }, []);

  const openEdit = useCallback((sched) => {
    setEditId(sched.id);
    setName(sched.name);
    setTimezone(sched.timezone || "UTC");
    setSchedEnabled(sched.enabled);
    setSelectedCollectionIds(new Set(parseIds(sched.collectionIds)));
    setSelectedProductIds(new Set(parseIds(sched.productIds)));
    const start = new Date(sched.startDate);
    const end = new Date(sched.endDate);
    setSelectedDates({ start, end });
    setMonthYear({ month: start.getMonth(), year: start.getFullYear() });
    setShowModal(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      shopify.toast.show("Please enter a schedule name");
      return;
    }
    const fd = new FormData();
    fd.append("intent", editId ? "update" : "create");
    if (editId) fd.append("id", editId);
    fd.append("name", name.trim());
    fd.append("startDate", selectedDates.start.toISOString());
    fd.append("endDate", selectedDates.end.toISOString());
    fd.append("timezone", timezone);
    fd.append("collectionIds", JSON.stringify(Array.from(selectedCollectionIds)));
    fd.append("productIds", JSON.stringify(Array.from(selectedProductIds)));
    fd.append("enabled", String(schedEnabled));
    submit(fd, { method: "post" });
    setShowModal(false);
    shopify.toast.show(editId ? "Schedule updated!" : "Schedule created!");
  }, [editId, name, selectedDates, timezone, selectedCollectionIds, selectedProductIds, schedEnabled, submit, shopify]);

  const handleCollectionPick = useCallback((id) => {
    setSelectedCollectionIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleProductPick = useCallback((id) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleToggle = useCallback(
    (id) => {
      const fd = new FormData();
      fd.append("intent", "toggle");
      fd.append("id", id);
      submit(fd, { method: "post" });
    },
    [submit]
  );

  const handleDelete = useCallback(
    (id) => {
      const fd = new FormData();
      fd.append("intent", "delete");
      fd.append("id", id);
      submit(fd, { method: "post" });
      shopify.toast.show("Schedule deleted");
    },
    [submit, shopify]
  );

  return (
    <Page
      title="Navigation Schedule"
      subtitle="Schedule when your sidebar navigation is visible"
      primaryAction={{ content: "Add Schedule", onAction: openAdd }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {schedules.length > 0 && (
              <Banner tone="info">
                When schedules are active, the sidebar only shows during scheduled windows. If no
                schedule is active, the sidebar is hidden.
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">
                    Schedules
                  </Text>
                  <Badge tone="info">{schedules.length} total</Badge>
                </InlineStack>
                <Divider />

                {schedules.length === 0 ? (
                  <EmptyState
                    heading="No schedules defined"
                    action={{ content: "Add Schedule", onAction: openAdd }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>
                      Add a schedule to control exactly when your sidebar appears — perfect for
                      seasonal sales, holiday promotions, and flash events.
                    </p>
                  </EmptyState>
                ) : (
                  <ResourceList
                    items={schedules}
                    renderItem={(sched) => (
                      <ResourceItem id={sched.id} accessibilityLabel={sched.name}>
                        <InlineStack align="space-between" blockAlign="center" wrap={false}>
                          <BlockStack gap="100">
                            <InlineStack gap="200" blockAlign="center">
                              <Text variant="bodyMd" fontWeight="semibold">
                                {sched.name}
                              </Text>
                              {isLive(sched) && sched.enabled && (
                                <Badge tone="success">Live</Badge>
                              )}
                              <Badge tone={sched.enabled ? "success" : "attention"}>
                                {sched.enabled ? "Enabled" : "Disabled"}
                              </Badge>
                            </InlineStack>
                            <Text variant="bodySm" tone="subdued">
                              {fmtDate(sched.startDate)} → {fmtDate(sched.endDate)} ·{" "}
                              {sched.timezone}
                            </Text>
                            <Text variant="bodySm" tone="subdued">
                              {parseIds(sched.collectionIds).length} collections ·{" "}
                              {parseIds(sched.productIds).length} products
                            </Text>
                          </BlockStack>
                          <InlineStack gap="200">
                            <Button size="slim" onClick={() => openEdit(sched)}>
                              Edit
                            </Button>
                            <Button
                              size="slim"
                              variant="secondary"
                              onClick={() => handleToggle(sched.id)}
                            >
                              {sched.enabled ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              size="slim"
                              variant="primary"
                              tone="critical"
                              onClick={() => handleDelete(sched.id)}
                            >
                              Delete
                            </Button>
                          </InlineStack>
                        </InlineStack>
                      </ResourceItem>
                    )}
                  />
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  How Scheduling Works
                </Text>
                <Divider />
                <Text variant="bodySm" as="p">
                  <strong>No schedules:</strong> Sidebar always follows your Settings (enabled/disabled).
                </Text>
                <Text variant="bodySm" as="p">
                  <strong>Schedules defined:</strong> Sidebar only appears when at least one enabled
                  schedule is currently active (current time falls within its date range). If that
                  schedule has selected products or collections, only those items are shown.
                </Text>
                <Text variant="bodySm" as="p">
                  <strong>Multiple schedules:</strong> Sidebar shows if ANY one of them is active.
                  Use this for recurring events (e.g. Diwali + Black Friday + Christmas).
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editId ? "Edit Schedule" : "Add Schedule"}
        primaryAction={{
          content: "Save Schedule",
          onAction: handleSave,
          loading: isLoading,
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setShowModal(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Schedule Name"
              value={name}
              onChange={setName}
              placeholder="e.g. Summer Sale, Black Friday, Diwali"
              autoComplete="off"
              helpText="A descriptive name for this visibility window"
            />

            <BlockStack gap="200">
              <Text variant="bodyMd" as="p" fontWeight="semibold">
                Date Range
              </Text>
              <Text variant="bodySm" as="p" tone="subdued">
                Select the start and end dates for this schedule
              </Text>
              <DatePicker
                month={month}
                year={year}
                onChange={setSelectedDates}
                onMonthChange={(m, y) => setMonthYear({ month: m, year: y })}
                selected={selectedDates}
                allowRange
                disableDatesBefore={new Date(2020, 0, 1)}
              />
              <Text variant="bodySm" as="p" tone="subdued">
                Selected: {fmtDate(selectedDates.start?.toISOString())} →{" "}
                {fmtDate(selectedDates.end?.toISOString())}
              </Text>
            </BlockStack>

            <Select
              label="Timezone"
              options={TIMEZONES}
              value={timezone}
              onChange={setTimezone}
              helpText="Reference timezone for this schedule (informational)"
            />

            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="bodyMd" as="p" fontWeight="semibold">
                  Scheduled Collections
                </Text>
                <Badge tone="info">{selectedCollectionIds.size} selected</Badge>
              </InlineStack>
              {collections.length === 0 ? (
                <Text variant="bodySm" tone="subdued" as="p">
                  Add collections first, then assign them to this schedule.
                </Text>
              ) : (
                <BlockStack gap="200">
                  {collections.map((col) => (
                    <InlineStack key={col.id} align="space-between" blockAlign="center">
                      <InlineStack gap="300" blockAlign="center">
                        <Thumbnail
                          source={
                            col.customImage ||
                            col.image ||
                            "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1.png"
                          }
                          alt={col.title}
                          size="small"
                        />
                        <Text variant="bodyMd" as="span">
                          {col.customLabel || col.title}
                        </Text>
                      </InlineStack>
                      <Checkbox
                        label=""
                        checked={selectedCollectionIds.has(col.collectionId)}
                        onChange={() => handleCollectionPick(col.collectionId)}
                      />
                    </InlineStack>
                  ))}
                </BlockStack>
              )}
            </BlockStack>

            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="bodyMd" as="p" fontWeight="semibold">
                  Scheduled Products
                </Text>
                <Badge tone="info">{selectedProductIds.size} selected</Badge>
              </InlineStack>
              {products.length === 0 ? (
                <Text variant="bodySm" tone="subdued" as="p">
                  Add products first, then assign them to this schedule.
                </Text>
              ) : (
                <BlockStack gap="200">
                  {products.map((prod) => (
                    <InlineStack key={prod.id} align="space-between" blockAlign="center">
                      <InlineStack gap="300" blockAlign="center">
                        <Thumbnail
                          source={
                            prod.customImage ||
                            prod.image ||
                            "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1.png"
                          }
                          alt={prod.title}
                          size="small"
                        />
                        <Text variant="bodyMd" as="span">
                          {prod.customLabel || prod.title}
                        </Text>
                      </InlineStack>
                      <Checkbox
                        label=""
                        checked={selectedProductIds.has(prod.productId)}
                        onChange={() => handleProductPick(prod.productId)}
                      />
                    </InlineStack>
                  ))}
                </BlockStack>
              )}
              <Text variant="bodySm" tone="subdued" as="p">
                Leave both lists empty to show the full sidebar during this schedule.
              </Text>
            </BlockStack>

            <Checkbox
              label="Enable this schedule immediately"
              checked={schedEnabled}
              onChange={setSchedEnabled}
              helpText="Disable to save without activating"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
