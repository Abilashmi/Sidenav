import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useCallback, useRef } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Page,
  Card,
  Button,
  Text,
  Badge,
  InlineStack,
  BlockStack,
  Modal,
  Banner,
  EmptyState,
  Box,
  TextField,
  Divider,
  Thumbnail,
  IndexTable,
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
        node { id title handle image { url } }
      }
    }
  }
`;

async function fetchAllCollections(admin) {
  const results = [];
  let cursor = null;
  let hasMore = true;
  while (hasMore) {
    const response = await admin.graphql(COLLECTIONS_QUERY, {
      variables: { first: 50, after: cursor },
    });
    const data = await response.json();
    const edges = data?.data?.collections?.edges ?? [];
    results.push(
      ...edges.map((e) => ({
        id: e.node.id,
        title: e.node.title,
        handle: e.node.handle,
        image: e.node.image?.url ?? null,
      })),
    );
    hasMore = data?.data?.collections?.pageInfo?.hasNextPage ?? false;
    cursor = data?.data?.collections?.pageInfo?.endCursor ?? null;
  }
  return results;
}

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

/* ── Loader ──────────────────────────────────────────────────────────────── */

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shopifyCollections = await fetchAllCollections(admin);

  const shop = await prisma.shop.findUnique({
    where: { shop: session.shop },
    include: {
      mappings: {
        orderBy: [{ parentCollectionId: "asc" }, { position: "asc" }],
      },
    },
  });

  const collectionImageMap = Object.fromEntries(
    shopifyCollections.map((c) => [c.id, c.image]),
  );

  const groupsMap = {};
  (shop?.mappings ?? []).forEach((m) => {
    if (!groupsMap[m.parentCollectionId]) {
      groupsMap[m.parentCollectionId] = {
        parentCollectionId: m.parentCollectionId,
        parentHandle: m.parentHandle,
        parentTitle: m.parentTitle,
        parentImage: collectionImageMap[m.parentCollectionId] ?? null,
        items: [],
      };
    }
    groupsMap[m.parentCollectionId].items.push(m);
  });

  return json({
    shopifyCollections,
    groups: Object.values(groupsMap),
  });
};

/* ── Action ──────────────────────────────────────────────────────────────── */

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const shop = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  if (intent === "save-group") {
    const parentCollectionId = formData.get("parentCollectionId");
    const parentHandle = formData.get("parentHandle");
    const parentTitle = formData.get("parentTitle");
    const relatedCollections = JSON.parse(
      formData.get("relatedCollections") || "[]",
    );

    // Get current max position for this parent to append new items after existing ones
    const existing = await prisma.collectionMapping.findMany({
      where: { shopId: shop.id, parentCollectionId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const basePosition = existing.length > 0 ? existing[0].position + 1 : 0;

    await prisma.collectionMapping.createMany({
      data: relatedCollections.map((c, idx) => ({
        shopId: shop.id,
        parentCollectionId,
        parentHandle,
        parentTitle,
        relatedCollectionId: c.id,
        relatedHandle: c.handle,
        relatedTitle: c.title,
        relatedImage: c.image || null,
        position: basePosition + idx,
        enabled: true,
      })),
      skipDuplicates: true,
    });
    await writeSidebarMetafield(admin, session.shop);
    return json({ success: true });
  }

  if (intent === "remove-group") {
    const parentCollectionId = formData.get("parentCollectionId");
    await prisma.collectionMapping.deleteMany({
      where: { shopId: shop.id, parentCollectionId },
    });
    await writeSidebarMetafield(admin, session.shop);
    return json({ success: true });
  }

  if (intent === "remove-related") {
    const id = formData.get("id");
    await prisma.collectionMapping.delete({ where: { id } });
    await writeSidebarMetafield(admin, session.shop);
    return json({ success: true });
  }

  if (intent === "toggle-related") {
    const id = formData.get("id");
    const enabled = formData.get("enabled") === "true";
    await prisma.collectionMapping.update({
      where: { id },
      data: { enabled: !enabled },
    });
    await writeSidebarMetafield(admin, session.shop);
    return json({ success: true });
  }

  if (intent === "reorder-related") {
    const id = formData.get("id");
    const direction = formData.get("direction");
    const parentCollectionId = formData.get("parentCollectionId");
    const siblings = await prisma.collectionMapping.findMany({
      where: { shopId: shop.id, parentCollectionId },
      orderBy: { position: "asc" },
    });
    const idx = siblings.findIndex((s) => s.id === id);
    if (idx === -1) return json({ success: true });
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= siblings.length)
      return json({ success: true });
    await prisma.$transaction([
      prisma.collectionMapping.update({
        where: { id: siblings[idx].id },
        data: { position: siblings[targetIdx].position },
      }),
      prisma.collectionMapping.update({
        where: { id: siblings[targetIdx].id },
        data: { position: siblings[idx].position },
      }),
    ]);
    await writeSidebarMetafield(admin, session.shop);
    return json({ success: true });
  }

  if (intent === "update-related") {
    const id = formData.get("id");
    const customLabel = formData.get("customLabel")?.trim() || null;
    const customImageRaw = formData.get("customImage") ?? "";
    const customImage = customImageRaw.length > 0 ? customImageRaw : null;
    await prisma.collectionMapping.update({
      where: { id },
      data: { customLabel, customImage },
    });
    await writeSidebarMetafield(admin, session.shop);
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

/* ── Page component ──────────────────────────────────────────────────────── */

export default function MappingsPage() {
  const { shopifyCollections, groups } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isLoading = navigation.state === "submitting";

  // Create group modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState("");
  const [createSelectedRelated, setCreateSelectedRelated] = useState(new Set());

  // Add more modal (per existing group)
  const [addMoreGroup, setAddMoreGroup] = useState(null);
  const [addMoreSelected, setAddMoreSelected] = useState(new Set());

  // Edit related modal
  const [editItem, setEditItem] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [editImageDraft, setEditImageDraft] = useState(null);
  const [editUploading, setEditUploading] = useState(false);
  const editFileRef = useRef(null);

  /* Collections already used as parents */
  const existingParentIds = new Set(groups.map((g) => g.parentCollectionId));
  const availableParents = shopifyCollections.filter(
    (c) => !existingParentIds.has(c.id),
  );

  /* Collections available for related selection in create modal */
  const relatedOptions = shopifyCollections.filter(
    (c) => c.id !== createParentId,
  );

  /* ── Create group handlers ── */
  const openCreate = useCallback(() => {
    setCreateParentId("");
    setCreateSelectedRelated(new Set());
    setCreateOpen(true);
  }, []);

  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    setCreateParentId("");
    setCreateSelectedRelated(new Set());
  }, []);

  const handleCreateGroup = useCallback(() => {
    if (!createParentId || createSelectedRelated.size === 0) return;
    const parent = shopifyCollections.find((c) => c.id === createParentId);
    const related = shopifyCollections.filter((c) =>
      createSelectedRelated.has(c.id),
    );
    const fd = new FormData();
    fd.append("intent", "save-group");
    fd.append("parentCollectionId", parent.id);
    fd.append("parentHandle", parent.handle);
    fd.append("parentTitle", parent.title);
    fd.append("relatedCollections", JSON.stringify(related));
    submit(fd, { method: "post" });
    shopify.toast.show("Category group created!");
    closeCreate();
  }, [
    createParentId,
    createSelectedRelated,
    shopifyCollections,
    submit,
    shopify,
    closeCreate,
  ]);

  const toggleCreateRelated = useCallback((id) => {
    setCreateSelectedRelated((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  /* ── Add more handlers ── */
  const openAddMore = useCallback((group) => {
    setAddMoreGroup(group);
    setAddMoreSelected(new Set());
  }, []);

  const handleAddMore = useCallback(() => {
    if (!addMoreGroup || addMoreSelected.size === 0) return;
    const existingIds = new Set(
      addMoreGroup.items.map((i) => i.relatedCollectionId),
    );
    const toAdd = shopifyCollections.filter(
      (c) => addMoreSelected.has(c.id) && !existingIds.has(c.id),
    );
    if (toAdd.length === 0) return;
    const fd = new FormData();
    fd.append("intent", "save-group");
    fd.append("parentCollectionId", addMoreGroup.parentCollectionId);
    fd.append("parentHandle", addMoreGroup.parentHandle);
    fd.append("parentTitle", addMoreGroup.parentTitle);
    fd.append("relatedCollections", JSON.stringify(toAdd));
    submit(fd, { method: "post" });
    shopify.toast.show("Collections added!");
    setAddMoreGroup(null);
  }, [addMoreGroup, addMoreSelected, shopifyCollections, submit, shopify]);

  /* ── Group / related actions ── */
  const handleRemoveGroup = useCallback(
    (parentCollectionId) => {
      const fd = new FormData();
      fd.append("intent", "remove-group");
      fd.append("parentCollectionId", parentCollectionId);
      submit(fd, { method: "post" });
      shopify.toast.show("Group removed");
    },
    [submit, shopify],
  );

  const handleRemoveRelated = useCallback(
    (id) => {
      const fd = new FormData();
      fd.append("intent", "remove-related");
      fd.append("id", id);
      submit(fd, { method: "post" });
      shopify.toast.show("Removed");
    },
    [submit, shopify],
  );

  const handleToggleRelated = useCallback(
    (id, enabled) => {
      const fd = new FormData();
      fd.append("intent", "toggle-related");
      fd.append("id", id);
      fd.append("enabled", String(enabled));
      submit(fd, { method: "post" });
    },
    [submit],
  );

  const handleReorderRelated = useCallback(
    (id, direction, parentCollectionId) => {
      const fd = new FormData();
      fd.append("intent", "reorder-related");
      fd.append("id", id);
      fd.append("direction", direction);
      fd.append("parentCollectionId", parentCollectionId);
      submit(fd, { method: "post" });
    },
    [submit],
  );

  /* ── Edit related handlers ── */
  const openEdit = useCallback((item) => {
    setEditItem(item);
    setEditLabel(item.customLabel || "");
    setEditImageDraft(null);
  }, []);

  const closeEdit = useCallback(() => {
    setEditItem(null);
    setEditLabel("");
    setEditImageDraft(null);
    setEditUploading(false);
  }, []);

  const handleEditSave = useCallback(() => {
    if (!editItem) return;
    const fd = new FormData();
    fd.append("intent", "update-related");
    fd.append("id", editItem.id);
    fd.append("customLabel", editLabel.trim());
    const imgToSend =
      editImageDraft === null
        ? editItem.customImage || ""
        : editImageDraft || "";
    fd.append("customImage", imgToSend);
    submit(fd, { method: "post" });
    shopify.toast.show("Updated!");
    closeEdit();
  }, [editItem, editLabel, editImageDraft, submit, shopify, closeEdit]);

  const handleEditUpload = useCallback(
    () => editFileRef.current?.click(),
    [],
  );

  const handleEditFile = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file || !editItem) return;
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
    [editItem, shopify],
  );

  const editPreviewSrc =
    editImageDraft === null
      ? editItem?.customImage || editItem?.relatedImage || PLACEHOLDER
      : editImageDraft || editItem?.relatedImage || PLACEHOLDER;

  /* ── Render ──────────────────────────────────────────────────────────────── */

  return (
    <Page
      title="Category Navigation"
      subtitle="Show context-aware sub-collections when visitors browse specific collection pages"
      primaryAction={{
        content: "New Category Group",
        onAction: openCreate,
        disabled: availableParents.length === 0 && groups.length > 0,
      }}
    >
      {/* Hidden upload input */}
      <input
        ref={editFileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: "none" }}
        onChange={handleEditFile}
      />

      <BlockStack gap="500">
        <Banner tone="info">
          <p>
            Create <strong>category groups</strong> to make your sidebar
            context-aware. When a visitor browses a parent collection (e.g.{" "}
            <em>Shirts</em>), the sidebar automatically switches to show only
            the related sub-collections you configure here (e.g.{" "}
            <em>Denim Shirts, Cotton Shirts…</em>). If a visitor is browsing a
            sub-collection, the sidebar shows its siblings.
          </p>
        </Banner>

        {groups.length === 0 ? (
          <Card>
            <EmptyState
              heading="No category groups yet"
              action={{
                content: "New Category Group",
                onAction: openCreate,
              }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>
                Create a category group to make your sidebar dynamically show
                relevant sub-collections when visitors browse a specific
                collection page.
              </p>
            </EmptyState>
          </Card>
        ) : (
          groups.map((group) => (
            <Card key={group.parentCollectionId}>
              <BlockStack gap="400">
                {/* Group header */}
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center">
                    <Thumbnail
                      source={group.parentImage || PLACEHOLDER}
                      alt={group.parentTitle}
                      size="small"
                    />
                    <BlockStack gap="050">
                      <Text variant="headingMd" as="h3">
                        {group.parentTitle}
                      </Text>
                      <Text variant="bodySm" tone="subdued" as="p">
                        Sidebar switches to these collections when visiting{" "}
                        <strong>/{group.parentHandle}</strong> or any of its
                        sub-collections
                      </Text>
                    </BlockStack>
                  </InlineStack>
                  <Button
                    tone="critical"
                    variant="plain"
                    onClick={() =>
                      handleRemoveGroup(group.parentCollectionId)
                    }
                  >
                    Remove Group
                  </Button>
                </InlineStack>

                <Divider />

                {/* Related collections table */}
                {group.items.length > 0 ? (
                  <IndexTable
                    resourceName={{
                      singular: "collection",
                      plural: "collections",
                    }}
                    itemCount={group.items.length}
                    headings={[
                      { title: "Collection" },
                      { title: "Order" },
                      { title: "Status" },
                      { title: "Actions" },
                    ]}
                    selectable={false}
                  >
                    {group.items.map((item, itemIdx) => {
                      const displayImage =
                        item.customImage || item.relatedImage || PLACEHOLDER;
                      return (
                        <IndexTable.Row
                          id={item.id}
                          key={item.id}
                          position={itemIdx}
                        >
                          <IndexTable.Cell>
                            <InlineStack gap="300" blockAlign="center">
                              <Thumbnail
                                source={displayImage}
                                alt={item.relatedTitle}
                                size="small"
                              />
                              <BlockStack gap="050">
                                <Text
                                  variant="bodyMd"
                                  fontWeight="semibold"
                                  as="span"
                                >
                                  {item.relatedTitle}
                                </Text>
                                {item.customLabel && (
                                  <Text
                                    variant="bodySm"
                                    tone="info"
                                    as="span"
                                  >
                                    Sidebar: &ldquo;{item.customLabel}&rdquo;
                                  </Text>
                                )}
                                <Text
                                  variant="bodySm"
                                  tone="subdued"
                                  as="span"
                                >
                                  /{item.relatedHandle}
                                </Text>
                              </BlockStack>
                            </InlineStack>
                          </IndexTable.Cell>

                          <IndexTable.Cell>
                            <Text variant="bodySm" as="span">
                              {itemIdx + 1}
                            </Text>
                          </IndexTable.Cell>

                          <IndexTable.Cell>
                            <Badge
                              tone={item.enabled ? "success" : "attention"}
                            >
                              {item.enabled ? "Visible" : "Hidden"}
                            </Badge>
                          </IndexTable.Cell>

                          <IndexTable.Cell>
                            <InlineStack gap="200" wrap={false}>
                              <Button
                                size="slim"
                                disabled={itemIdx === 0}
                                onClick={() =>
                                  handleReorderRelated(
                                    item.id,
                                    "up",
                                    group.parentCollectionId,
                                  )
                                }
                              >
                                ↑
                              </Button>
                              <Button
                                size="slim"
                                disabled={
                                  itemIdx === group.items.length - 1
                                }
                                onClick={() =>
                                  handleReorderRelated(
                                    item.id,
                                    "down",
                                    group.parentCollectionId,
                                  )
                                }
                              >
                                ↓
                              </Button>
                              <Button
                                size="slim"
                                onClick={() => openEdit(item)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="slim"
                                onClick={() =>
                                  handleToggleRelated(item.id, item.enabled)
                                }
                              >
                                {item.enabled ? "Hide" : "Show"}
                              </Button>
                              <Button
                                size="slim"
                                tone="critical"
                                onClick={() => handleRemoveRelated(item.id)}
                              >
                                Remove
                              </Button>
                            </InlineStack>
                          </IndexTable.Cell>
                        </IndexTable.Row>
                      );
                    })}
                  </IndexTable>
                ) : (
                  <Box padding="400">
                    <Text variant="bodySm" tone="subdued" as="p">
                      No related collections yet. Add some below.
                    </Text>
                  </Box>
                )}

                <InlineStack align="start">
                  <Button onClick={() => openAddMore(group)}>
                    + Add Collections
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          ))
        )}
      </BlockStack>

      {/* ── Create Group Modal ── */}
      <Modal
        open={createOpen}
        onClose={closeCreate}
        title="New Category Group"
        primaryAction={{
          content: "Create Group",
          onAction: handleCreateGroup,
          disabled: !createParentId || createSelectedRelated.size === 0,
          loading: isLoading,
        }}
        secondaryActions={[{ content: "Cancel", onAction: closeCreate }]}
        large
      >
        <Modal.Section>
          <BlockStack gap="500">
            <BlockStack gap="200">
              <Text variant="bodyMd" fontWeight="semibold" as="p">
                Parent Collection
              </Text>
              <Text variant="bodySm" tone="subdued" as="p">
                When a visitor browses this collection page, the sidebar will
                show the related collections you choose below.
              </Text>
              {availableParents.length === 0 ? (
                <Banner tone="warning">
                  <p>
                    All your collections are already configured as parent
                    groups.
                  </p>
                </Banner>
              ) : (
                <select
                  value={createParentId}
                  onChange={(e) => {
                    setCreateParentId(e.target.value);
                    setCreateSelectedRelated(new Set());
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #c9cccf",
                    fontSize: "14px",
                    background: "#fff",
                    color: createParentId ? "#1a1a1a" : "#6d7175",
                  }}
                >
                  <option value="">Select a collection…</option>
                  {availableParents.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} (/{c.handle})
                    </option>
                  ))}
                </select>
              )}
            </BlockStack>

            {createParentId && (
              <>
                <Divider />
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text variant="bodyMd" fontWeight="semibold" as="p">
                      Related Collections
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      {createSelectedRelated.size} selected
                    </Text>
                  </InlineStack>
                  <Text variant="bodySm" tone="subdued" as="p">
                    These collections will appear in the sidebar when visitors
                    browse the parent collection above.
                  </Text>
                  {relatedOptions.map((col) => (
                    <Card key={col.id} padding="300">
                      <InlineStack
                        gap="300"
                        blockAlign="center"
                        align="space-between"
                      >
                        <InlineStack gap="300" blockAlign="center">
                          <Thumbnail
                            source={col.image || PLACEHOLDER}
                            alt={col.title}
                            size="small"
                          />
                          <BlockStack gap="050">
                            <Text
                              variant="bodyMd"
                              fontWeight="semibold"
                              as="span"
                            >
                              {col.title}
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="span">
                              /{col.handle}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                        <input
                          type="checkbox"
                          checked={createSelectedRelated.has(col.id)}
                          onChange={() => toggleCreateRelated(col.id)}
                          style={{ width: 18, height: 18, cursor: "pointer" }}
                          aria-label={`Select ${col.title}`}
                        />
                      </InlineStack>
                    </Card>
                  ))}
                </BlockStack>
              </>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* ── Add More Modal ── */}
      {addMoreGroup && (
        <Modal
          open
          onClose={() => setAddMoreGroup(null)}
          title={`Add to "${addMoreGroup.parentTitle}"`}
          primaryAction={{
            content: "Add Selected",
            onAction: handleAddMore,
            disabled: addMoreSelected.size === 0,
            loading: isLoading,
          }}
          secondaryActions={[
            { content: "Cancel", onAction: () => setAddMoreGroup(null) },
          ]}
          large
        >
          <Modal.Section>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="bodySm" tone="subdued" as="p">
                  {addMoreSelected.size} selected
                </Text>
              </InlineStack>
              {(() => {
                const existingIds = new Set(
                  addMoreGroup.items.map((i) => i.relatedCollectionId),
                );
                const available = shopifyCollections.filter(
                  (c) =>
                    c.id !== addMoreGroup.parentCollectionId &&
                    !existingIds.has(c.id),
                );
                if (available.length === 0) {
                  return (
                    <Banner tone="info">
                      <p>
                        All collections have already been added to this group.
                      </p>
                    </Banner>
                  );
                }
                return available.map((col) => (
                  <Card key={col.id} padding="300">
                    <InlineStack
                      gap="300"
                      blockAlign="center"
                      align="space-between"
                    >
                      <InlineStack gap="300" blockAlign="center">
                        <Thumbnail
                          source={col.image || PLACEHOLDER}
                          alt={col.title}
                          size="small"
                        />
                        <BlockStack gap="050">
                          <Text
                            variant="bodyMd"
                            fontWeight="semibold"
                            as="span"
                          >
                            {col.title}
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="span">
                            /{col.handle}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                      <input
                        type="checkbox"
                        checked={addMoreSelected.has(col.id)}
                        onChange={() =>
                          setAddMoreSelected((prev) => {
                            const next = new Set(prev);
                            next.has(col.id)
                              ? next.delete(col.id)
                              : next.add(col.id);
                            return next;
                          })
                        }
                        style={{ width: 18, height: 18, cursor: "pointer" }}
                        aria-label={`Select ${col.title}`}
                      />
                    </InlineStack>
                  </Card>
                ));
              })()}
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}

      {/* ── Edit Related Modal ── */}
      {editItem && (
        <Modal
          open
          onClose={closeEdit}
          title={`Edit: ${editItem.relatedTitle}`}
          primaryAction={{
            content: "Save Changes",
            onAction: handleEditSave,
            loading: editUploading,
          }}
          secondaryActions={[{ content: "Cancel", onAction: closeEdit }]}
        >
          <Modal.Section>
            <BlockStack gap="500">
              <TextField
                label="Sidebar Display Name"
                placeholder={editItem.relatedTitle}
                value={editLabel}
                onChange={setEditLabel}
                helpText="Custom name shown in the sidebar. Leave blank to use the collection name."
                autoComplete="off"
                clearButton
                onClearButtonClick={() => setEditLabel("")}
              />

              <Divider />

              <BlockStack gap="300">
                <Text variant="bodyMd" fontWeight="semibold" as="p">
                  Sidebar Image / GIF
                </Text>
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
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </div>
                  <BlockStack gap="200">
                    <Text variant="bodySm" tone="subdued" as="p">
                      {editImageDraft
                        ? "New image ready — click Save to apply."
                        : editItem.customImage
                          ? "Custom image is active."
                          : "Using collection image."}
                    </Text>
                    <InlineStack gap="200">
                      <Button
                        size="slim"
                        loading={editUploading}
                        onClick={handleEditUpload}
                      >
                        {editItem.customImage || editImageDraft
                          ? "Replace Image"
                          : "Upload Image"}
                      </Button>
                      {(editItem.customImage || editImageDraft) && (
                        <Button
                          size="slim"
                          tone="critical"
                          variant="plain"
                          onClick={() => setEditImageDraft("")}
                        >
                          Remove
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
