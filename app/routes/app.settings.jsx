import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Page,
  Layout,
  Card,
  Button,
  Select,
  Checkbox,
  RangeSlider,
  ColorPicker,
  BlockStack,
  InlineStack,
  Text,
  Divider,
  Badge,
  Banner,
  Box,
  TextField,
  hsbToHex,
  hexToRgb,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import SidebarPreview from "../components/SidebarPreview";

function hexToHsb(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return { hue: 0, saturation: 0, brightness: 1 };
  const r = rgb.red / 255, g = rgb.green / 255, b = rgb.blue / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const brightness = max;
  const saturation = max === 0 ? 0 : (max - min) / max;
  let hue = 0;
  if (max !== min) {
    if (max === r) hue = ((g - b) / (max - min) + (g < b ? 6 : 0)) / 6;
    else if (max === g) hue = ((b - r) / (max - min) + 2) / 6;
    else hue = ((r - g) / (max - min) + 4) / 6;
  }
  return { hue: hue * 360, saturation, brightness };
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { shop: session.shop },
    include: {
      settings: true,
      collections: {
        where: { enabled: true },
        orderBy: { sortOrder: "asc" },
        take: 10,
      },
    },
  });
  return json({
    settings: shop?.settings ?? null,
    collections: shop?.collections ?? [],
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const shop = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  const data = {
    enabled: formData.get("enabled") === "true",
    position: formData.get("position") || "left",
    mobileOnly: formData.get("mobileOnly") === "true",
    backgroundColor: formData.get("backgroundColor") || "#ffffff",
    textColor: formData.get("textColor") || "#1a1a1a",
    borderRadius: parseInt(formData.get("borderRadius") || "12"),
    shadow: formData.get("shadow") === "true",
    iconSize: parseInt(formData.get("iconSize") || "56"),
    animationStyle: formData.get("animationStyle") || "slide",
    opacity: parseFloat(formData.get("opacity") || "1"),
    zIndex: parseInt(formData.get("zIndex") || "9999"),
  };

  await prisma.sidebarSettings.upsert({
    where: { shopId: shop.id },
    update: data,
    create: { shopId: shop.id, ...data },
  });

  return json({ success: true });
};

export default function SettingsPage() {
  const { settings, collections } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isLoading = navigation.state === "submitting";

  const [enabled, setEnabled] = useState(settings?.enabled ?? true);
  const [position, setPosition] = useState(settings?.position ?? "left");
  const [mobileOnly, setMobileOnly] = useState(settings?.mobileOnly ?? false);
  const [backgroundColor, setBackgroundColor] = useState(settings?.backgroundColor ?? "#ffffff");
  const [textColor, setTextColor] = useState(settings?.textColor ?? "#1a1a1a");
  const [borderRadius, setBorderRadius] = useState(settings?.borderRadius ?? 12);
  const [shadow, setShadow] = useState(settings?.shadow ?? true);
  const [iconSize, setIconSize] = useState(settings?.iconSize ?? 56);
  const [animationStyle, setAnimationStyle] = useState(settings?.animationStyle ?? "slide");
  const [opacity, setOpacity] = useState(settings?.opacity ?? 1.0);

  const [bgColorHsb, setBgColorHsb] = useState(() => hexToHsb(backgroundColor));
  const [textColorHsb, setTextColorHsb] = useState(() => hexToHsb(textColor));

  const handleBgColorChange = useCallback((hsb) => {
    setBgColorHsb(hsb);
    setBackgroundColor(hsbToHex(hsb));
  }, []);

  const handleBgColorText = useCallback((val) => {
    setBackgroundColor(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      setBgColorHsb(hexToHsb(val));
    }
  }, []);

  const handleTextColorChange = useCallback((hsb) => {
    setTextColorHsb(hsb);
    setTextColor(hsbToHex(hsb));
  }, []);

  const handleTextColorText = useCallback((val) => {
    setTextColor(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      setTextColorHsb(hexToHsb(val));
    }
  }, []);

  const handleSave = useCallback(() => {
    const formData = new FormData();
    formData.append("enabled", String(enabled));
    formData.append("position", position);
    formData.append("mobileOnly", String(mobileOnly));
    formData.append("backgroundColor", backgroundColor);
    formData.append("textColor", textColor);
    formData.append("borderRadius", String(borderRadius));
    formData.append("shadow", String(shadow));
    formData.append("iconSize", String(iconSize));
    formData.append("animationStyle", animationStyle);
    formData.append("opacity", String(opacity));
    formData.append("zIndex", "9999");
    submit(formData, { method: "post" });
    shopify.toast.show("Settings saved!");
  }, [enabled, position, mobileOnly, backgroundColor, textColor, borderRadius, shadow, iconSize, animationStyle, opacity, submit, shopify]);

  const previewSettings = {
    enabled, position, mobileOnly, backgroundColor, textColor,
    borderRadius, shadow, iconSize, animationStyle, opacity,
  };

  return (
    <Page
        title="Sidebar Settings"
        subtitle="Customize your floating sidebar appearance and behavior"
        primaryAction={{
          content: "Save Settings",
          onAction: handleSave,
          loading: isLoading,
        }}
      >
        <Layout>
          {/* Left — Settings Form */}
          <Layout.Section>
            <BlockStack gap="400">

              {/* General */}
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">General</Text>
                  <Divider />
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text variant="bodyMd" as="p" fontWeight="semibold">Enable Sidebar</Text>
                      <Text variant="bodySm" as="p" tone="subdued">Show the floating sidebar on your storefront</Text>
                    </BlockStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone={enabled ? "success" : "attention"}>{enabled ? "Active" : "Inactive"}</Badge>
                      <Checkbox
                        label=""
                        checked={enabled}
                        onChange={setEnabled}
                      />
                    </InlineStack>
                  </InlineStack>
                  <Select
                    label="Sidebar Position"
                    options={[
                      { label: "Left side", value: "left" },
                      { label: "Right side", value: "right" },
                    ]}
                    value={position}
                    onChange={setPosition}
                    helpText="Where the sidebar appears on the screen"
                  />
                  <Checkbox
                    label="Mobile Only"
                    helpText="Only show the sidebar on mobile devices"
                    checked={mobileOnly}
                    onChange={setMobileOnly}
                  />
                </BlockStack>
              </Card>

              {/* Appearance */}
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Appearance</Text>
                  <Divider />

                  <BlockStack gap="200">
                    <Text variant="bodyMd" as="p" fontWeight="semibold">Background Color</Text>
                    <InlineStack gap="300" blockAlign="center">
                      <Box
                        width="32px"
                        minHeight="32px"
                        borderRadius="200"
                        background="bg-surface"
                        style={{ backgroundColor, border: "1px solid #ddd" }}
                      />
                      <TextField
                        label=""
                        value={backgroundColor}
                        onChange={handleBgColorText}
                        autoComplete="off"
                        maxLength={7}
                        placeholder="#ffffff"
                      />
                    </InlineStack>
                    <ColorPicker onChange={handleBgColorChange} color={bgColorHsb} />
                  </BlockStack>

                  <Divider />

                  <BlockStack gap="200">
                    <Text variant="bodyMd" as="p" fontWeight="semibold">Text Color</Text>
                    <InlineStack gap="300" blockAlign="center">
                      <Box
                        width="32px"
                        minHeight="32px"
                        borderRadius="200"
                        background="bg-surface"
                        style={{ backgroundColor: textColor, border: "1px solid #ddd" }}
                      />
                      <TextField
                        label=""
                        value={textColor}
                        onChange={handleTextColorText}
                        autoComplete="off"
                        maxLength={7}
                        placeholder="#1a1a1a"
                      />
                    </InlineStack>
                    <ColorPicker onChange={handleTextColorChange} color={textColorHsb} />
                  </BlockStack>

                  <Divider />

                  <RangeSlider
                    label={`Border Radius: ${borderRadius}px`}
                    min={0}
                    max={32}
                    value={borderRadius}
                    onChange={setBorderRadius}
                    output
                    helpText="Roundness of the sidebar container"
                  />

                  <RangeSlider
                    label={`Icon Size: ${iconSize}px`}
                    min={40}
                    max={80}
                    value={iconSize}
                    onChange={setIconSize}
                    output
                    helpText="Size of each collection icon in the sidebar"
                  />

                  <RangeSlider
                    label={`Opacity: ${Math.round(opacity * 100)}%`}
                    min={0.5}
                    max={1}
                    step={0.05}
                    value={opacity}
                    onChange={setOpacity}
                    output
                    helpText="Transparency of the sidebar"
                  />

                  <Checkbox
                    label="Drop Shadow"
                    helpText="Add a subtle shadow to the sidebar"
                    checked={shadow}
                    onChange={setShadow}
                  />
                </BlockStack>
              </Card>

              {/* Animation */}
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Animation</Text>
                  <Divider />
                  <Select
                    label="Animation Style"
                    options={[
                      { label: "Slide In", value: "slide" },
                      { label: "Fade In", value: "fade" },
                      { label: "Scale In", value: "scale" },
                      { label: "No Animation", value: "none" },
                    ]}
                    value={animationStyle}
                    onChange={setAnimationStyle}
                    helpText="How the sidebar appears when the page loads"
                  />
                </BlockStack>
              </Card>

            </BlockStack>
          </Layout.Section>

          {/* Right — Live Preview */}
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Live Preview</Text>
                <Divider />
                <SidebarPreview settings={previewSettings} collections={collections} />
                <Text variant="bodySm" as="p" tone="subdued">
                  Preview updates as you change settings.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

        </Layout>

      </Page>
  );
}
