import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useCallback, useRef } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Page,
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
  Box,
  TextField,
  Divider,
  Select,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { writeSidebarMetafield } from "../metafields.server";

const PLACEHOLDER =
  "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1.png";

const COLLECTIONS_QUERY = `
  query GetCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id title handle
          image { url altText }
          productsCount { count }
        }
      }
    }
  }
`;

/* ── Upload helpers (same as before) ─────────────────────────────────────── */

async function getUploadUrl(filename, mimeType, fileSize) {
  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, mimeType, fileSize }),
  });
  if (!res.ok) throw new Error("Failed to get upload URL");
  return res.json();
}

async function uploadToShopify(file, url, parameters) {
  const fd = new FormData();
  parameters.forEach(({ name, value }) => fd.append(name, value));
  fd.append("file", file);
  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok && res.status !== 201) throw new Error("Upload failed");
}

/* ── Pencil SVG icon ─────────────────────────────────────────────────────── */

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 1.83H5v-.75l9.06-9.06.75.75-8.89 9.06zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
  );
}

/* ── Loader ──────────────────────────────────────────────────────────────── */

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { shop: session.shop },
    include: { collections: { orderBy: { sortOrder: "asc" } } },
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
      })),
    );
    hasMore = data?.data?.collections?.pageInfo?.hasNextPage ?? false;
    cursor = data?.data?.collections?.pageInfo?.endCursor ?? null;
  }
  return json({
    shopifyCollections: allShopifyCollections,
    savedCollections: shop?.collections ?? [],
  });
};

/* ── Action ──────────────────────────────────────────────────────────────── */

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const shop = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  if (intent === "save") {
    const collections = JSON.parse(formData.get("collections") || "[]");
    const existing = await prisma.selectedCollection.findMany({
      where: { shopId: shop.id },
      select: { collectionId: true, customImage: true, imageType: true, customLabel: true },
    });
    const saved = Object.fromEntries(
      existing.map((c) => [
        c.collectionId,
        { customImage: c.customImage, imageType: c.imageType, customLabel: c.customLabel },
      ]),
    );
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
            customImage: saved[col.id]?.customImage ?? null,
            imageType: saved[col.id]?.imageType ?? "image",
            customLabel: saved[col.id]?.customLabel ?? null,
          })),
        });
      }
    });
    await writeSidebarMetafield(admin, session.shop);
    return json({ success: true });
  }

  if (intent === "toggle") {
    const collectionId = formData.get("collectionId");
    const enabled = formData.get("enabled") === "true";
    await prisma.selectedCollection.update({
      where: { shopId_collectionId: { shopId: shop.id, collectionId } },
      data: { enabled },
    });
    await writeSidebarMetafield(admin, session.shop);
    return json({ success: true });
  }

  if (intent === "remove") {
    const collectionId = formData.get("collectionId");
    await prisma.selectedCollection.delete({
      where: { shopId_collectionId: { shopId: shop.id, collectionId } },
    });
    await writeSidebarMetafield(admin, session.shop);
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
        where: {
          shopId_collectionId: {
            shopId: shop.id,
            collectionId: all[targetIdx].collectionId,
          },
        },
        data: { sortOrder: all[idx].sortOrder },
      }),
    ]);
    await writeSidebarMetafield(admin, session.shop);
    return json({ success: true });
  }

  // Edit modal save — updates custom label, custom image, and parent atomically
  if (intent === "set-custom-display") {
    const collectionId = formData.get("collectionId");
    const customLabel = formData.get("customLabel")?.trim() || null;
    const customImageRaw = formData.get("customImage") ?? "";
    const customImage = customImageRaw.length > 0 ? customImageRaw : null;
    const imageType = customImage?.toLowerCase().includes(".gif") ? "gif" : "image";
    const parentCollectionId = formData.get("parentCollectionId") || null;
    await prisma.selectedCollection.update({
      where: { shopId_collectionId: { shopId: shop.id, collectionId } },
      data: { customLabel, customImage, imageType, parentCollectionId },
    });
    await writeSidebarMetafield(admin, session.shop);
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

/* ── Page component ──────────────────────────────────────────────────────── */

export default function CollectionsPage() {
  const { shopifyCollections, savedCollections } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isLoading = navigation.state === "submitting";

  // Collection picker modal
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(
    new Set(savedCollections.map((c) => c.collectionId)),
  );

  // Edit modal
  const [editModal, setEditModal] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [editParent, setEditParent] = useState("");
  const [editImageDraft, setEditImageDraft] = useState(null);
  const [editUploading, setEditUploading] = useState(false);
  const editFileRef = useRef(null);

  /* Collection picker handlers */
  const handleCheckbox = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handlePickerSave = useCallback(() => {
    const selected = shopifyCollections
      .filter((c) => selectedIds.has(c.id))
      .map((c, i) => ({ ...c, enabled: true, sortOrder: i }));
    const fd = new FormData();
    fd.append("intent", "save");
    fd.append("collections", JSON.stringify(selected));
    submit(fd, { method: "post" });
    setPickerOpen(false);
    shopify.toast.show("Collections saved!");
  }, [selectedIds, shopifyCollections, submit, shopify]);

  /* Row action handlers */
  const handleRemove = useCallback(
    (collectionId) => {
      const fd = new FormData();
      fd.append("intent", "remove");
      fd.append("collectionId", collectionId);
      submit(fd, { method: "post" });
      shopify.toast.show("Collection removed");
    },
    [submit, shopify],
  );

  const handleToggle = useCallback(
    (collectionId, enabled) => {
      const fd = new FormData();
      fd.append("intent", "toggle");
      fd.append("collectionId", collectionId);
      fd.append("enabled", String(!enabled));
      submit(fd, { method: "post" });
    },
    [submit],
  );

  const handleReorder = useCallback(
    (collectionId, direction) => {
      const fd = new FormData();
      fd.append("intent", "reorder");
      fd.append("collectionId", collectionId);
      fd.append("direction", direction);
      submit(fd, { method: "post" });
    },
    [submit],
  );

  /* Edit modal handlers */
  const openEdit = useCallback((col) => {
    setEditModal(col);
    setEditLabel(col.customLabel || "");
    setEditParent(col.parentCollectionId || "");
    setEditImageDraft(null); // null = no change
  }, []);

  const closeEdit = useCallback(() => {
    setEditModal(null);
    setEditLabel("");
    setEditParent("");
    setEditImageDraft(null);
    setEditUploading(false);
  }, []);

  const handleEditSave = useCallback(() => {
    if (!editModal) return;
    const fd = new FormData();
    fd.append("intent", "set-custom-display");
    fd.append("collectionId", editModal.collectionId);
    fd.append("customLabel", editLabel.trim());
    // null = no change → send existing; "" = clear; URL = new
    const imgToSend =
      editImageDraft === null
        ? editModal.customImage || ""
        : editImageDraft || "";
    fd.append("customImage", imgToSend);
    fd.append("parentCollectionId", editParent);
    submit(fd, { method: "post" });
    shopify.toast.show("Collection updated!");
    closeEdit();
  }, [editModal, editLabel, editParent, editImageDraft, submit, shopify, closeEdit]);

  const handleEditUpload = useCallback(() => editFileRef.current?.click(), []);

  const handleEditFile = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file || !editModal) return;
      e.target.value = "";
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowed.includes(file.type)) {
        shopify.toast.show("Use JPG, PNG, WEBP, or GIF.", { isError: true });
        return;
      }
      setEditUploading(true);
      try {
        const { url, resourceUrl, parameters } = await getUploadUrl(
          file.name,
          file.type,
          file.size,
        );
        await uploadToShopify(file, url, parameters);
        setEditImageDraft(resourceUrl);
      } catch {
        shopify.toast.show("Upload failed. Try again.", { isError: true });
      } finally {
        setEditUploading(false);
      }
    },
    [editModal, shopify],
  );

  // What image to show in the edit modal preview
  const editPreviewSrc =
    editImageDraft === null
      ? editModal?.customImage || editModal?.image || PLACEHOLDER
      : editImageDraft || editModal?.image || PLACEHOLDER;

  /* Build a lookup map: collectionId → title for parent badges */
  const collectionTitleMap = Object.fromEntries(
    savedCollections.map((c) => [c.collectionId, c.customLabel || c.title])
  );

  /* Row markup */
  const rowMarkup = savedCollections.map((col, index) => {
    const displayImage = col.customImage || col.image || PLACEHOLDER;
    const hasCustom = !!col.customImage || !!col.customLabel;
    const parentTitle = col.parentCollectionId
      ? collectionTitleMap[col.parentCollectionId]
      : null;
    return (
      <IndexTable.Row id={col.id} key={col.id} position={index}>
        <IndexTable.Cell>
          <InlineStack gap="300" blockAlign="center">
            <Thumbnail source={displayImage} alt={col.title} size="small" />
            <BlockStack gap="050">
              <Text variant="bodyMd" fontWeight="semibold" as="span">
                {col.title}
              </Text>
              {col.customLabel && (
                <Text variant="bodySm" tone="info" as="span">
                  Sidebar: "{col.customLabel}"
                </Text>
              )}
              <Text variant="bodySm" tone="subdued" as="span">
                /{col.handle}
              </Text>
            </BlockStack>
          </InlineStack>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <Text variant="bodySm" as="span">
            {index + 1}
          </Text>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <InlineStack gap="200" blockAlign="center" wrap>
            <Badge tone={col.enabled ? "success" : "attention"}>
              {col.enabled ? "Visible" : "Hidden"}
            </Badge>
            {hasCustom && <Badge tone="info">Customised</Badge>}
            {parentTitle && (
              <Badge tone="warning">Child of {parentTitle}</Badge>
            )}
          </InlineStack>
        </IndexTable.Cell>

        <IndexTable.Cell>
          <InlineStack gap="200" wrap={false}>
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
              icon={PencilIcon}
              onClick={() => openEdit(col)}
            >
              Edit
            </Button>
            <Button
              size="slim"
              onClick={() => handleToggle(col.collectionId, col.enabled)}
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
    );
  });

  return (
    <Page
      title="Collections"
      subtitle="Select and customise collections for your floating sidebar"
      primaryAction={{ content: "Add Collections", onAction: () => setPickerOpen(true) }}
    >
      {/* Hidden file input for image uploads inside modal */}
      <input
        ref={editFileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: "none" }}
        onChange={handleEditFile}
      />

      <BlockStack gap="400">
        <Banner tone="info">
          <p>
            Click <strong>Edit</strong> on any collection to set a custom sidebar
            name, upload a custom image, or add a GIF.
          </p>
        </Banner>

        <Card>
          {savedCollections.length === 0 ? (
            <EmptyState
              heading="No collections added yet"
              action={{ content: "Add Collections", onAction: () => setPickerOpen(true) }}
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

      {/* ── Collection Picker Modal ── */}
      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Select Collections"
        primaryAction={{
          content: "Save",
          onAction: handlePickerSave,
          loading: isLoading,
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setPickerOpen(false) }]}
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
                        source={col.image || PLACEHOLDER}
                        alt={col.title}
                        size="small"
                      />
                      <BlockStack gap="050">
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                          {col.title}
                        </Text>
                        <Text variant="bodySm" tone="subdued" as="span">
                          {col.productsCount} products
                        </Text>
                      </BlockStack>
                    </InlineStack>
                    <Checkbox
                      label=""
                      checked={selectedIds.has(col.id)}
                      onChange={() => handleCheckbox(col.id)}
                    />
                  </InlineStack>
                </Card>
              ))}
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>

      {/* ── Edit Modal ── */}
      {editModal && (
        <Modal
          open
          onClose={closeEdit}
          title={`Edit: ${editModal.title}`}
          primaryAction={{
            content: "Save Changes",
            onAction: handleEditSave,
            loading: editUploading,
          }}
          secondaryActions={[{ content: "Cancel", onAction: closeEdit }]}
        >
          <Modal.Section>
            <BlockStack gap="500">

              {/* Custom Display Name */}
              <TextField
                label="Sidebar Display Name"
                placeholder={editModal.title}
                value={editLabel}
                onChange={setEditLabel}
                helpText="Custom name shown in the sidebar. Leave blank to use the collection name."
                autoComplete="off"
                clearButton
                onClearButtonClick={() => setEditLabel("")}
              />

              {/* Parent Collection */}
              <Select
                label="Parent Collection"
                options={[
                  { label: "None (top-level)", value: "" },
                  ...savedCollections
                    .filter(
                      (c) =>
                        c.collectionId !== editModal.collectionId &&
                        !c.parentCollectionId,
                    )
                    .map((c) => ({
                      label: c.customLabel || c.title,
                      value: c.collectionId,
                    })),
                ]}
                value={editParent}
                onChange={setEditParent}
                helpText="Nest this collection under a parent to create sub-categories in the sidebar."
              />

              <Divider />

              {/* Image / GIF */}
              <BlockStack gap="300">
                <Text variant="bodyMd" fontWeight="semibold" as="p">
                  Sidebar Image / GIF
                </Text>

                {/* Preview */}
                <InlineStack gap="400" blockAlign="center">
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 10,
                      overflow: "hidden",
                      border: "1px solid #e0e0e0",
                      flexShrink: 0,
                      background: "#f5f5f5",
                    }}
                  >
                    <img
                      src={editPreviewSrc}
                      alt="Preview"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  </div>

                  <BlockStack gap="200">
                    <Text variant="bodySm" tone="subdued" as="p">
                      {editImageDraft
                        ? "New image ready — click Save to apply."
                        : editModal.customImage
                        ? "Custom image is active."
                        : "Using Shopify collection image."}
                    </Text>
                    <InlineStack gap="200">
                      <Button
                        size="slim"
                        loading={editUploading}
                        onClick={handleEditUpload}
                      >
                        {editModal.customImage || editImageDraft
                          ? "Replace Image"
                          : "Upload Image"}
                      </Button>
                      {(editModal.customImage || editImageDraft) && (
                        <Button
                          size="slim"
                          tone="critical"
                          variant="plain"
                          onClick={() => setEditImageDraft("")}
                        >
                          Remove Custom Image
                        </Button>
                      )}
                    </InlineStack>
                    <Text variant="bodySm" tone="subdued" as="p">
                      JPG, PNG, WEBP, GIF supported
                    </Text>
                  </BlockStack>
                </InlineStack>
              </BlockStack>

            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
