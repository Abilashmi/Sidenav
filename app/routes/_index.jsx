import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { login } from "../shopify.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop) {
    const appParams = new URLSearchParams(url.searchParams);
    appParams.delete("dev-console");

    // Shopify is loading the embedded app; forward auth params to /app.
    throw redirect(`/app?${appParams.toString()}`);
  }

  const errors = await login(request);
  return json({ errors, shop: "" });
};

export const action = async ({ request }) => {
  const errors = await login(request);
  return json({ errors });
};

export default function Index() {
  const { shop } = useLoaderData();
  const actionData = useActionData();
  const shopError = actionData?.errors?.shop;

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1 style={styles.title}>Floating Side Navigation</h1>
        <p style={styles.copy}>Enter your Shopify store domain to open the app.</p>
        <Form method="post" style={styles.form}>
          <label style={styles.label} htmlFor="shop">
            Shop domain
          </label>
          <input
            id="shop"
            name="shop"
            defaultValue={shop}
            placeholder="your-store.myshopify.com"
            autoComplete="on"
            style={styles.input}
          />
          {shopError ? <p style={styles.error}>Enter a valid Shopify store domain.</p> : null}
          <button type="submit" style={styles.button}>
            Continue
          </button>
        </Form>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f6f6f7",
    color: "#202223",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#ffffff",
    border: "1px solid #dfe3e8",
    borderRadius: 8,
    boxShadow: "0 1px 0 rgba(0, 0, 0, 0.05)",
    padding: 28,
  },
  title: {
    fontSize: 24,
    lineHeight: 1.25,
    margin: "0 0 8px",
  },
  copy: {
    fontSize: 14,
    lineHeight: 1.5,
    margin: "0 0 20px",
    color: "#6d7175",
  },
  form: {
    display: "grid",
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
  },
  input: {
    height: 40,
    border: "1px solid #babfc3",
    borderRadius: 6,
    fontSize: 14,
    padding: "0 12px",
  },
  error: {
    color: "#d72c0d",
    fontSize: 13,
    margin: 0,
  },
  button: {
    height: 40,
    border: 0,
    borderRadius: 6,
    background: "#008060",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
};
