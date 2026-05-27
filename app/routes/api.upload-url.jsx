import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

const STAGED_UPLOADS_MUTATION = `
  mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    const body = await request.json();
    const { filename, mimeType, fileSize } = body;

    if (!filename || !mimeType || !fileSize) {
      return json(
        { error: "Missing required fields: filename, mimeType, fileSize" },
        { status: 400, headers },
      );
    }

    const response = await admin.graphql(STAGED_UPLOADS_MUTATION, {
      variables: {
        input: [
          {
            filename,
            mimeType,
            resource: "IMAGE",
            httpMethod: "POST",
            fileSize: String(fileSize),
          },
        ],
      },
    });

    const data = await response.json();
    const userErrors = data?.data?.stagedUploadsCreate?.userErrors ?? [];
    if (userErrors.length > 0) {
      return json({ error: userErrors[0].message }, { status: 400, headers });
    }

    const target = data?.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target) {
      return json(
        { error: "Failed to create staged upload target" },
        { status: 500, headers },
      );
    }

    return json(
      {
        url: target.url,
        resourceUrl: target.resourceUrl,
        parameters: target.parameters,
      },
      { headers },
    );
  } catch (err) {
    console.error("[upload-url]", err);
    return json({ error: "Internal server error" }, { status: 500, headers });
  }
};
