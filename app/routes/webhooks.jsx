import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { topic, shop, session, admin, payload } =
    await authenticate.webhook(request);

  if (!admin && topic !== "SHOP_REDACT") {
    throw new Response();
  }

  switch (topic) {
    case "APP_UNINSTALLED":
      if (session) {
        // Clean up shop data on uninstall
        const shopRecord = await prisma.shop.findUnique({
          where: { shop },
        });
        if (shopRecord) {
          await prisma.selectedCollection.deleteMany({
            where: { shopId: shopRecord.id },
          });
          await prisma.sidebarSettings.deleteMany({
            where: { shopId: shopRecord.id },
          });
          await prisma.shop.delete({ where: { shop } });
        }
        await prisma.session.deleteMany({ where: { shop } });
      }
      break;
    case "CUSTOMERS_DATA_REQUEST":
      // GDPR: no customer data stored
      break;
    case "CUSTOMERS_REDACT":
      // GDPR: no customer data stored
      break;
    case "SHOP_REDACT":
      // GDPR: clean up shop data
      const shopRecord = await prisma.shop.findUnique({ where: { shop } });
      if (shopRecord) {
        await prisma.selectedCollection.deleteMany({
          where: { shopId: shopRecord.id },
        });
        await prisma.sidebarSettings.deleteMany({
          where: { shopId: shopRecord.id },
        });
        await prisma.shop.delete({ where: { shop } });
      }
      break;
    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  throw new Response();
};
