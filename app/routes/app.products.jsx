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
  Banner,
  EmptyState,
  TextField,
  Divider,
  Modal,
  Spinner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { writeSidebarMetafield } from "../metafields.server";

/* ── Pencil icon ─────────────────────────────────────────────────────────── */

function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
    </svg>
  );
}

/* ── Server loader ───────────────────────────────────────────────────────── */

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { shop: session.shop },
    include: {
      products: { orderBy: { sortOrder: "asc" } },
    },
  });
  return json({ savedProducts: shop?.products ?? [] });
};

/* ── Server action ───────────────────────────────────────────────────────── */

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const shop = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  if (intent === "save") {
    const products = JSON.parse(formData.get("products") || "[]");
    if (products.length === 0) return json({ success: true });

    const maxOrderRow = await prisma.sidebarProduct.findFirst({
      where: { shopId: shop.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let nextOrder = (maxOrderRow?.sortOrder ?? -1) + 1;

    for (const p of products) {
      await prisma.sidebarProduct.upsert({
        where: { shopId_productId: { shopId: shop.id, productId: p.id } },
        update: {
          title: p.title,
          handle: p.handle,
          image: p.image || null,
          price: p.price || null,
        },
        create: {
          shopId: shop.id,
          productId: p.id,
          title: p.title,
          handle: p.handle,
          image: p.image || null,
          price: p.price || null,
          badge: null,
          customLabel: null,
          customImage: null,
          sortOrder: nextOrder++,
          enabled: true,
        },
      });
    }
    await writeSidebarMetafield(admin, session.shop);
    return json({ success: true });
  }

  if (intent === "remove") {
    const productId = formData.get("productId");
    await prisma.sidebarProduct.delete({
      where: { shopId_productId: { shopId: shop.id, productId } },
    });
    await writeSidebarMetafield(admin, session.shop);
    return json({ success: true });
  }

  if (intent === "toggle") {
    const productId = formData.get("productId");
    const enabled = formData.get("enabled") === "true";
    await prisma.sidebarProduct.update({
      where: { shopId_productId: { shopId: shop.id, productId } },
      data: { enabled: !enabled },
    });
    await writeSidebarMetafield(admin, session.shop);
    return json({ success: true });
  }

  if (intent === "set-badge") {
    const productId = formData.get("productId");
    const badge = formData.get("badge") || null;
    await prisma.sidebarProduct.update({
      where: { shopId_productId: { shopId: shop.id, productId } },
      data: { badge },
    });
    await writeSidebarMetafield(admin, session.shop);
    return json({ success: true });
  }

  if (intent === "reorder") {
    const productId = formData.get("productId");
    const direction = formData.get("direction");
    const all = await prisma.sidebarProduct.findMany({
      where: { shopId: shop.id },
      orderBy: { sortOrder: "asc" },
    });
    const idx = all.findIndex((p) => p.productId === productId);
    if (idx === -1) return json({ success: true });
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= all.length) return json({ success: true });
    await prisma.$transaction([
      prisma.sidebarProduct.update({
        where: { shopId_productId: { shopId: shop.id, productId: all[idx].productId } },
        data: { sortOrder: all[targetIdx].sortOrder },
      }),
      prisma.sidebarProduct.update({
        where: { shopId_productId: { shopId: shop.id, productId: all[targetIdx].productId } },
        data: { sortOrder: all[idx].sortOrder },
      }),
    ]);
    await writeSidebarMetafield(admin, session.shop);
    return json({ success: true });
  }

  if (intent === "set-custom-display") {
    const productId = formData.get("productId");
    const customLabel = formData.get("customLabel") || null;
    const customImage = formData.get("customImage") || null;
    const clearImage = formData.get("clearImage") === "true";
    await prisma.sidebarProduct.update({
      where: { shopId_productId: { shopId: shop.id, productId } },
      data: {
        customLabel,
        customImage: clearImage ? null : customImage,
      },
    });
    await writeSidebarMetafield(admin, session.shop);
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

/* ── Upload helpers ──────────────────────────────────────────────────────── */

async function getUploadUrl(filename, mimeType, fileSize) {
  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, mimeType, fileSize }),
  });
  return res.json();
}

async function uploadToShopify(file, url, parameters) {
  const fd = new FormData();
  parameters.forEach(({ name, value }) => fd.append(name, value));
  fd.append("file", file);
  await fetch(url, { method: "POST", body: fd });
}

/* ── Page component ──────────────────────────────────────────────────────── */

export default function ProductsPage() {
  const { savedProducts } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isLoading = navigation.state === "submitting";
  const [badgeEdits, setBadgeEdits] = useState({});

  // Edit modal state
  const [editModal, setEditModal] = useState(null); // the product record being edited
  const [editLabel, setEditLabel] = useState("");
  const [editImageDraft, setEditImageDraft] = useState(undefined); // undefined=unchanged, null=cleared, string=new URL
  const [editUploading, setEditUploading] = useState(false);
  const editFileRef = useRef(null);

  /* ── Resource picker ─────────────────────────────────────────────────── */

  const handlePickProducts = useCallback(async () => {
    const result = await shopify.resourcePicker({
      type: "product",
      multiple: true,
    });
    if (!result || result.length === 0) return;
    const products = result.map((p) => ({
      id: p.id,
      title: p.title,
      handle: p.handle,
      image: p.images?.[0]?.originalSrc || p.featuredImage?.url || null,
      price: p.variants?.[0]?.price ?? null,
    }));
    const fd = new FormData();
    fd.append("intent", "save");
    fd.append("products", JSON.stringify(products));
    submit(fd, { method: "post" });
    shopify.toast.show(`${products.length} product${products.length > 1 ? "s" : ""} added!`);
  }, [submit, shopify]);

  /* ── Row actions ─────────────────────────────────────────────────────── */

  const handleRemove = useCallback(
    (productId) => {
      const fd = new FormData();
      fd.append("intent", "remove");
      fd.append("productId", productId);
      submit(fd, { method: "post" });
      shopify.toast.show("Product removed");
    },
    [submit, shopify],
  );

  const handleToggle = useCallback(
    (productId, enabled) => {
      const fd = new FormData();
      fd.append("intent", "toggle");
      fd.append("productId", productId);
      fd.append("enabled", String(enabled));
      submit(fd, { method: "post" });
    },
    [submit],
  );

  const handleReorder = useCallback(
    (productId, direction) => {
      const fd = new FormData();
      fd.append("intent", "reorder");
      fd.append("productId", productId);
      fd.append("direction", direction);
      submit(fd, { method: "post" });
    },
    [submit],
  );

  const handleSaveBadge = useCallback(
    (productId) => {
      const fd = new FormData();
      fd.append("intent", "set-badge");
      fd.append("productId", productId);
      fd.append("badge", badgeEdits[productId] ?? "");
      submit(fd, { method: "post" });
      shopify.toast.show("Badge saved!");
    },
    [badgeEdits, submit, shopify],
  );

  /* ── Edit modal ──────────────────────────────────────────────────────── */

  const openEdit = useCallback((prod) => {
    setEditModal(prod);
    setEditLabel(prod.customLabel || "");
    setEditImageDraft(undefined);
  }, []);

  const closeEdit = useCallback(() => {
    setEditModal(null);
    setEditImageDraft(undefined);
  }, []);

  const handleEditFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditUploading(true);
    try {
      const { url, resourceUrl, parameters } = await getUploadUrl(
        file.name,
        file.type,
        file.size,
      );
      await uploadToShopify(file, url, parameters);
      setEditImageDraft(resourceUrl);
    } catch (err) {
      shopify.toast.show("Upload failed", { isError: true });
    } finally {
      setEditUploading(false);
      if (editFileRef.current) editFileRef.current.value = "";
    }
  }, [shopify]);

  const handleSaveEdit = useCallback(() => {
    if (!editModal) return;
    const fd = new FormData();
    fd.append("intent", "set-custom-display");
    fd.append("productId", editModal.productId);
    fd.append("customLabel", editLabel);
    if (editImageDraft === null) {
      fd.append("clearImage", "true");
    } else if (editImageDraft) {
      fd.append("customImage", editImageDraft);
    }
    submit(fd, { method: "post" });
    shopify.toast.show("Display settings saved!");
    closeEdit();
  }, [editModal, editLabel, editImageDraft, submit, shopify, closeEdit]);

  /* ── Compute preview image for modal ─────────────────────────────────── */

  function modalPreviewImage() {
    if (!editModal) return null;
    if (editImageDraft === null) return null;
    if (editImageDraft) return editImageDraft;
    return editModal.customImage || editModal.image || null;
  }

  /* ── Table rows ──────────────────────────────────────────────────────── */

  const rowMarkup = savedProducts.map((prod, index) => (
    <IndexTable.Row id={prod.id} key={prod.id} position={index}>
      <IndexTable.Cell>
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
          <BlockStack gap="050">
            <Text variant="bodyMd" fontWeight="semibold" as="span">
              {prod.title}
            </Text>
            {prod.customLabel && (
              <Text variant="bodySm" tone="magic" as="span">
                Sidebar: {prod.customLabel}
              </Text>
            )}
            <Text variant="bodySm" tone="subdued" as="span">
              /{prod.handle}
            </Text>
            {prod.price && (
              <Text variant="bodySm" tone="success" as="span">
                ${prod.price}
              </Text>
            )}
          </BlockStack>
        </InlineStack>
      </IndexTable.Cell>

      <IndexTable.Cell>
        <Text variant="bodySm" as="span">
          {index + 1}
        </Text>
      </IndexTable.Cell>

      <IndexTable.Cell>
        <InlineStack gap="200" blockAlign="center">
          <TextField
            label=""
            placeholder="NEW, SALE…"
            value={badgeEdits[prod.productId] ?? prod.badge ?? ""}
            onChange={(v) =>
              setBadgeEdits((prev) => ({ ...prev, [prod.productId]: v }))
            }
            autoComplete="off"
            connectedRight={
              <Button
                size="slim"
                onClick={() => handleSaveBadge(prod.productId)}
              >
                Save
              </Button>
            }
          />
        </InlineStack>
      </IndexTable.Cell>

      <IndexTable.Cell>
        <InlineStack gap="150" blockAlign="center">
          <Badge tone={prod.enabled ? "success" : "attention"}>
            {prod.enabled ? "Visible" : "Hidden"}
          </Badge>
          {(prod.customLabel || prod.customImage) && (
            <Badge tone="info">Customised</Badge>
          )}
        </InlineStack>
      </IndexTable.Cell>

      <IndexTable.Cell>
        <InlineStack gap="200">
          <Button
            size="slim"
            icon={<PencilIcon />}
            onClick={() => openEdit(prod)}
            accessibilityLabel={`Edit display for ${prod.title}`}
          >
            Edit
          </Button>
          <Button
            size="slim"
            disabled={index === 0}
            onClick={() => handleReorder(prod.productId, "up")}
          >
            ↑
          </Button>
          <Button
            size="slim"
            disabled={index === savedProducts.length - 1}
            onClick={() => handleReorder(prod.productId, "down")}
          >
            ↓
          </Button>
          <Button
            size="slim"
            onClick={() => handleToggle(prod.productId, prod.enabled)}
          >
            {prod.enabled ? "Hide" : "Show"}
          </Button>
          <Button
            size="slim"
            tone="critical"
            onClick={() => handleRemove(prod.productId)}
          >
            Remove
          </Button>
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  /* ── Render ──────────────────────────────────────────────────────────── */

  const previewImg = modalPreviewImage();

  return (
    <Page
      title="Products"
      subtitle="Add products to your floating sidebar navigation"
      primaryAction={{
        content: "Add Products",
        onAction: handlePickProducts,
        loading: isLoading,
      }}
    >
      <BlockStack gap="400">
        <Banner tone="info">
          <p>
            Products appear in the sidebar below collections. Click "Add Products" to
            pick one or more products — each pick is added to the list without
            removing existing ones. Use the Remove button to delete a product,
            and the Edit button to set a custom sidebar display name or image/GIF.
          </p>
        </Banner>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">
              Sidebar Products
            </Text>
            <Divider />
            {savedProducts.length === 0 ? (
              <EmptyState
                heading="No products added yet"
                action={{ content: "Add Products", onAction: handlePickProducts }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Add products to display alongside collections in your floating
                  sidebar.
                </p>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={{ singular: "product", plural: "products" }}
                itemCount={savedProducts.length}
                headings={[
                  { title: "Product" },
                  { title: "Order" },
                  { title: "Badge" },
                  { title: "Status" },
                  { title: "Actions" },
                ]}
                selectable={false}
              >
                {rowMarkup}
              </IndexTable>
            )}
          </BlockStack>
        </Card>
      </BlockStack>

      {/* ── Edit display modal ─────────────────────────────────────────── */}
      {editModal && (
        <Modal
          open
          onClose={closeEdit}
          title={`Edit sidebar display — ${editModal.title}`}
          primaryAction={{ content: "Save", onAction: handleSaveEdit }}
          secondaryActions={[{ content: "Cancel", onAction: closeEdit }]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <TextField
                label="Sidebar Display Name"
                helpText="Overrides the product title shown in the sidebar. Leave blank to use the original title."
                value={editLabel}
                onChange={setEditLabel}
                autoComplete="off"
                placeholder={editModal.title}
              />

              <BlockStack gap="200">
                <Text variant="bodyMd" fontWeight="semibold" as="p">
                  Sidebar Image / GIF
                </Text>

                {previewImg ? (
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 8,
                      overflow: "hidden",
                      border: "1px solid #e1e3e5",
                    }}
                  >
                    <img
                      src={previewImg}
                      alt="Preview"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                ) : (
                  <Text variant="bodySm" tone="subdued" as="p">
                    No custom image set — product image will be used.
                  </Text>
                )}

                <InlineStack gap="200" blockAlign="center">
                  {editUploading ? (
                    <Spinner size="small" />
                  ) : (
                    <>
                      <Button
                        size="slim"
                        onClick={() => editFileRef.current?.click()}
                      >
                        {previewImg ? "Replace Image" : "Upload Image / GIF"}
                      </Button>
                      {previewImg && (
                        <Button
                          size="slim"
                          tone="critical"
                          onClick={() => setEditImageDraft(null)}
                        >
                          Remove Image
                        </Button>
                      )}
                    </>
                  )}
                </InlineStack>

                <input
                  ref={editFileRef}
                  type="file"
                  accept="image/*,.gif"
                  style={{ display: "none" }}
                  onChange={handleEditFileChange}
                />

                <Text variant="bodySm" tone="subdued" as="p">
                  Supported: JPG, PNG, GIF, WebP. GIFs will animate in the sidebar.
                </Text>
              </BlockStack>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
