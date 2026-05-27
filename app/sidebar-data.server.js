import prisma from "./db.server";

const DEFAULT_SETTINGS = {
  enabled: false,
  position: "left",
  mobileOnly: false,
  backgroundColor: "#ffffff",
  textColor: "#1a1a1a",
  borderRadius: 12,
  shadow: true,
  iconSize: 56,
  animationStyle: "slide",
  opacity: 1.0,
  zIndex: 9999,
  sidebarMode: "hamburger",
  sidebarWidth: 280,
  topMargin: 20,
  bottomMargin: 20,
  pageVisibilityMode: "all",
  showOnHome: true,
  showOnCollection: true,
  showOnProduct: true,
  showOnBlog: false,
  showOnArticle: false,
  showOnCart: false,
  showOnSearch: false,
  showOnOtherPages: false,
};

export async function buildSidebarPayload(shopDomain) {
  const shopRecord = await prisma.shop.findUnique({
    where: { shop: shopDomain },
    include: {
      settings: true,
      collections: {
        where: { enabled: true },
        orderBy: { sortOrder: "asc" },
      },
      products: {
        where: { enabled: true },
        orderBy: { sortOrder: "asc" },
      },
      mappings: {
        where: { enabled: true },
        orderBy: [{ parentCollectionId: "asc" }, { position: "asc" }],
      },
    },
  });

  if (!shopRecord) return null;

  const settings = shopRecord.settings ?? DEFAULT_SETTINGS;

  const allCollections = shopRecord.collections.map((c) => ({
    id: c.collectionId,
    title: c.title,
    label: c.customLabel || c.title,
    handle: c.handle,
    image: c.customImage || c.image,
    imageType: c.imageType,
    sortOrder: c.sortOrder,
    parentCollectionId: c.parentCollectionId || null,
    type: "collection",
  }));

  const childMap = {};
  allCollections.forEach((c) => {
    if (c.parentCollectionId) {
      if (!childMap[c.parentCollectionId]) childMap[c.parentCollectionId] = [];
      childMap[c.parentCollectionId].push(c);
    }
  });

  const nestedCollections = allCollections
    .filter((c) => !c.parentCollectionId)
    .map((parent) => ({
      ...parent,
      children: (childMap[parent.id] || []).sort((a, b) => a.sortOrder - b.sortOrder),
    }));

  const products = shopRecord.products.map((p) => ({
    id: p.productId,
    title: p.title,
    label: p.customLabel || p.title,
    handle: p.handle,
    image: p.customImage || p.image,
    price: p.price,
    badge: p.badge,
    sortOrder: p.sortOrder,
    type: "product",
  }));

  const mappings = {};
  (shopRecord.mappings || []).forEach((m) => {
    if (!mappings[m.parentHandle]) {
      mappings[m.parentHandle] = {
        parentCollectionId: m.parentCollectionId,
        items: [],
      };
    }
    mappings[m.parentHandle].items.push({
      id: m.relatedCollectionId,
      handle: m.relatedHandle,
      title: m.relatedTitle,
      label: m.customLabel || m.relatedTitle,
      image: m.customImage || m.relatedImage,
    });
  });

  return { settings, collections: nestedCollections, products, mappings };
}
