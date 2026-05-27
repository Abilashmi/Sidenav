import { json } from "@remix-run/node";
import {
  isRouteErrorResponse,
  Link,
  Outlet,
  useLoaderData,
  useRouteError,
} from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import { writeSidebarMetafield } from "../metafields.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

// Write metafield once per server lifetime per shop (non-blocking)
const _synced = new Set();

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  if (!_synced.has(session.shop)) {
    _synced.add(session.shop);
    writeSidebarMetafield(admin, session.shop).catch((e) =>
      console.error("[FSN] Boot sync failed:", e)
    );
  }
  return json({ apiKey: process.env.SHOPIFY_API_KEY || "" });
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">Dashboard</Link>
        <Link to="/app/collections">Collections</Link>
        <Link to="/app/products">Products</Link>
        <Link to="/app/mappings">Category Nav</Link>
        <Link to="/app/settings">Settings</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    if (error.status === 410) {
      return (
        <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
          Loading Shopify session...
        </div>
      );
    }
    return boundary.error(error);
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h2>Something went wrong</h2>
      <p>{error instanceof Error ? error.message : "Unknown error — check the server logs."}</p>
    </div>
  );
}
