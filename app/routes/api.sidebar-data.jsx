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
    };

    const collections = shopRecord.collections.map((c) => ({
      id: c.collectionId,
      title: c.title,
      handle: c.handle,
      image: c.image,
      sortOrder: c.sortOrder,
    }));

    return json({ settings, collections }, { headers });
  } catch (error) {
    console.error("Sidebar data error:", error);
    return json({ error: "Internal server error" }, { status: 500, headers });
  }
};
