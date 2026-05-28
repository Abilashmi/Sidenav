import { json } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=60",
  };

  if (!shop) {
    return json({ error: "Missing shop parameter" }, { status: 400, headers });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  try {
    const shopRecord = await prisma.shop.findUnique({
      where: { shop },
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
        schedules: { where: { enabled: true }, orderBy: { createdAt: "asc" } },
        deviceSettings: { where: { enabled: true } },
        navigationMode: true,
      },
    });

    if (!shopRecord) {
      return json({ error: "Shop not found" }, { status: 404, headers });
    }

    const settings = shopRecord.settings ?? {
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

    // Flat list with all fields
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

    // Build nested tree: top-level items with children arrays
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

    // Build mappings keyed by parentHandle for O(1) storefront lookup
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

    const schedules = (shopRecord.schedules || []).map((s) => ({
      name: s.name,
      startDate: s.startDate.toISOString(),
      endDate: s.endDate.toISOString(),
      timezone: s.timezone,
      enabled: s.enabled,
    }));

    const deviceSettings = (shopRecord.deviceSettings || []).map((d) => ({
      deviceType: d.deviceType,
      settingsJson: d.settingsJson,
      enabled: d.enabled,
    }));

    const navigationMode = shopRecord.navigationMode
      ? { mode: shopRecord.navigationMode.mode, settingsJson: shopRecord.navigationMode.settingsJson }
      : null;

    return json(
      { settings, collections: nestedCollections, products, mappings, schedules, deviceSettings, navigationMode },
      { headers },
    );
  } catch (error) {
    console.error("Sidebar data error:", error);
    return json({ error: "Internal server error" }, { status: 500, headers });
  }
};
