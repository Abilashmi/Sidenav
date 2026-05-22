import { json } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import { addDocumentResponseHeaders } from "./shopify.server";

export const loader = async ({ request }) => {
  const headers = new Headers();
  addDocumentResponseHeaders(request, headers);
  return json({}, { headers });
};

export default function Root() {
  return (
    <html lang="en" style={{ backgroundColor: "#f1f1f1" }}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
        <style>{`html,body{background:#f1f1f1;margin:0}`}</style>
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
