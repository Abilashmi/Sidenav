import { redirect } from "@remix-run/node";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const redirectUri = url.searchParams.get("exitIframe");
  if (redirectUri) {
    throw redirect(redirectUri);
  }
  throw redirect("/app");
};
