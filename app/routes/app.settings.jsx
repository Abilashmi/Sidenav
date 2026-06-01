import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useCallback } from "react";
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
  Box,
  TextField,
  hsbToHex,
  hexToRgb,
  ButtonGroup,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import SidebarPreview from "../components/SidebarPreview";
import { writeSidebarMetafield } from "../metafields.server";

function hexToHsb(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return { hue: 0, saturation: 0, brightness: 1 };
  const r = rgb.red / 255,
    g = rgb.green / 255,
    b = rgb.blue / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
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
      products: {
        where: { enabled: true },
        orderBy: { sortOrder: "asc" },
        take: 6,
      },
    },
  });
  return json({
    settings: shop?.settings ?? null,
    collections: shop?.collections ?? [],
    products: shop?.products ?? [],
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const shop = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  const data = {
    enabled: formData.get("enabled") === "true",
    position: formData.get("position") || "left",
    mobileOnly: formData.get("mobileOnly") === "true",
    backgroundColor: formData.get("backgroundColor") || "#ffffff",
    textColor: formData.get("textColor") || "#1a1a1a",
    accentColor: formData.get("accentColor") || "#1a1a1a",
    hoverColor: formData.get("hoverColor") || "#f1f2f3",
    badgeColor: formData.get("badgeColor") || "#e53e3e",
    borderRadius: parseInt(formData.get("borderRadius") || "12"),
    shadow: formData.get("shadow") === "true",
    iconSize: parseInt(formData.get("iconSize") || "56"),
    animationStyle: formData.get("animationStyle") || "slide",
    opacity: parseFloat(formData.get("opacity") || "1"),
    zIndex: parseInt(formData.get("zIndex") || "9999"),
    // Phase 2
    sidebarMode: formData.get("sidebarMode") || "hamburger",
    sidebarWidth: parseInt(formData.get("sidebarWidth") || "280"),
    topMargin: parseInt(formData.get("topMargin") || "20"),
    bottomMargin: parseInt(formData.get("bottomMargin") || "20"),
    // Page visibility
    pageVisibilityMode: formData.get("pageVisibilityMode") || "all",
    showOnHome: formData.get("showOnHome") === "true",
    showOnCollection: formData.get("showOnCollection") === "true",
    showOnProduct: formData.get("showOnProduct") === "true",
    showOnBlog: formData.get("showOnBlog") === "true",
    showOnArticle: formData.get("showOnArticle") === "true",
    showOnCart: formData.get("showOnCart") === "true",
    showOnSearch: formData.get("showOnSearch") === "true",
    showOnOtherPages: formData.get("showOnOtherPages") === "true",
  };

  await prisma.sidebarSettings.upsert({
    where: { shopId: shop.id },
    update: data,
    create: { shopId: shop.id, ...data },
  });

  await writeSidebarMetafield(admin, session.shop);

  return json({ success: true });
};

export default function SettingsPage() {
  const { settings, collections, products } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isLoading = navigation.state === "submitting";

  // Existing settings
  const [enabled, setEnabled] = useState(settings?.enabled ?? true);
  const [position, setPosition] = useState(settings?.position ?? "left");
  const [mobileOnly, setMobileOnly] = useState(settings?.mobileOnly ?? false);
  const [backgroundColor, setBackgroundColor] = useState(settings?.backgroundColor ?? "#ffffff");
  const [textColor, setTextColor] = useState(settings?.textColor ?? "#1a1a1a");
  const [accentColor, setAccentColor] = useState(settings?.accentColor ?? "#1a1a1a");
  const [hoverColor, setHoverColor] = useState(settings?.hoverColor ?? "#f1f2f3");
  const [badgeColor, setBadgeColor] = useState(settings?.badgeColor ?? "#e53e3e");
  const [borderRadius, setBorderRadius] = useState(settings?.borderRadius ?? 12);
  const [shadow, setShadow] = useState(settings?.shadow ?? true);
  const [iconSize, setIconSize] = useState(settings?.iconSize ?? 56);
  const [animationStyle, setAnimationStyle] = useState(settings?.animationStyle ?? "slide");
  const [opacity, setOpacity] = useState(settings?.opacity ?? 1.0);

  // Phase 2 settings
  const [sidebarMode, setSidebarMode] = useState(settings?.sidebarMode ?? "hamburger");
  const [sidebarWidth, setSidebarWidth] = useState(String(settings?.sidebarWidth ?? 280));
  const [topMargin, setTopMargin] = useState(settings?.topMargin ?? 20);
  const [bottomMargin, setBottomMargin] = useState(settings?.bottomMargin ?? 20);

  // Page visibility settings
  const [pageVisibilityMode, setPageVisibilityMode] = useState(settings?.pageVisibilityMode ?? "all");
  const [showOnHome, setShowOnHome] = useState(settings?.showOnHome ?? true);
  const [showOnCollection, setShowOnCollection] = useState(settings?.showOnCollection ?? true);
  const [showOnProduct, setShowOnProduct] = useState(settings?.showOnProduct ?? true);
  const [showOnBlog, setShowOnBlog] = useState(settings?.showOnBlog ?? false);
  const [showOnArticle, setShowOnArticle] = useState(settings?.showOnArticle ?? false);
  const [showOnCart, setShowOnCart] = useState(settings?.showOnCart ?? false);
  const [showOnSearch, setShowOnSearch] = useState(settings?.showOnSearch ?? false);
  const [showOnOtherPages, setShowOnOtherPages] = useState(settings?.showOnOtherPages ?? false);

  const [bgColorHsb, setBgColorHsb] = useState(() => hexToHsb(backgroundColor));
  const [textColorHsb, setTextColorHsb] = useState(() => hexToHsb(textColor));
  const [accentColorHsb, setAccentColorHsb] = useState(() => hexToHsb(accentColor));
  const [hoverColorHsb, setHoverColorHsb] = useState(() => hexToHsb(hoverColor));
  const [badgeColorHsb, setBadgeColorHsb] = useState(() => hexToHsb(badgeColor));

  const handleBgColorChange = useCallback((hsb) => {
    setBgColorHsb(hsb);
    setBackgroundColor(hsbToHex(hsb));
  }, []);

  const handleBgColorText = useCallback((val) => {
    setBackgroundColor(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) setBgColorHsb(hexToHsb(val));
  }, []);

  const handleTextColorChange = useCallback((hsb) => {
    setTextColorHsb(hsb);
    setTextColor(hsbToHex(hsb));
  }, []);

  const handleTextColorText = useCallback((val) => {
    setTextColor(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) setTextColorHsb(hexToHsb(val));
  }, []);

  const handleAccentColorChange = useCallback((hsb) => {
    setAccentColorHsb(hsb);
    setAccentColor(hsbToHex(hsb));
  }, []);

  const handleAccentColorText = useCallback((val) => {
    setAccentColor(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) setAccentColorHsb(hexToHsb(val));
  }, []);

  const handleHoverColorChange = useCallback((hsb) => {
    setHoverColorHsb(hsb);
    setHoverColor(hsbToHex(hsb));
  }, []);

  const handleHoverColorText = useCallback((val) => {
    setHoverColor(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) setHoverColorHsb(hexToHsb(val));
  }, []);

  const handleBadgeColorChange = useCallback((hsb) => {
    setBadgeColorHsb(hsb);
    setBadgeColor(hsbToHex(hsb));
  }, []);

  const handleBadgeColorText = useCallback((val) => {
    setBadgeColor(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val)) setBadgeColorHsb(hexToHsb(val));
  }, []);

  const handleSave = useCallback(() => {
    const fd = new FormData();
    fd.append("enabled", String(enabled));
    fd.append("position", position);
    fd.append("mobileOnly", String(mobileOnly));
    fd.append("backgroundColor", backgroundColor);
    fd.append("textColor", textColor);
    fd.append("accentColor", accentColor);
    fd.append("hoverColor", hoverColor);
    fd.append("badgeColor", badgeColor);
    fd.append("borderRadius", String(borderRadius));
    fd.append("shadow", String(shadow));
    fd.append("iconSize", String(iconSize));
    fd.append("animationStyle", animationStyle);
    fd.append("opacity", String(opacity));
    fd.append("zIndex", "9999");
    fd.append("sidebarMode", sidebarMode);
    fd.append("sidebarWidth", String(sidebarWidth));
    fd.append("topMargin", String(topMargin));
    fd.append("bottomMargin", String(bottomMargin));
    fd.append("pageVisibilityMode", pageVisibilityMode);
    fd.append("showOnHome", String(showOnHome));
    fd.append("showOnCollection", String(showOnCollection));
    fd.append("showOnProduct", String(showOnProduct));
    fd.append("showOnBlog", String(showOnBlog));
    fd.append("showOnArticle", String(showOnArticle));
    fd.append("showOnCart", String(showOnCart));
    fd.append("showOnSearch", String(showOnSearch));
    fd.append("showOnOtherPages", String(showOnOtherPages));
    submit(fd, { method: "post" });
    shopify.toast.show("Settings saved!");
  }, [
    enabled, position, mobileOnly, backgroundColor, textColor, accentColor, hoverColor, badgeColor,
    borderRadius, shadow, iconSize, animationStyle, opacity,
    sidebarMode, sidebarWidth, topMargin, bottomMargin,
    pageVisibilityMode, showOnHome, showOnCollection, showOnProduct,
    showOnBlog, showOnArticle, showOnCart, showOnSearch, showOnOtherPages,
    submit, shopify,
  ]);

  const previewSettings = {
    enabled, position, mobileOnly, backgroundColor, textColor, accentColor, hoverColor, badgeColor,
    borderRadius, shadow, iconSize, animationStyle, opacity,
    sidebarMode, sidebarWidth: parseInt(sidebarWidth), topMargin, bottomMargin,
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
                    <Badge tone={enabled ? "success" : "attention"}>
                      {enabled ? "Active" : "Inactive"}
                    </Badge>
                    <Checkbox label="" checked={enabled} onChange={setEnabled} />
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

            {/* Navigation Mode (Phase 2) */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Navigation Mode</Text>
                <Divider />

                <BlockStack gap="200">
                  <Text variant="bodyMd" as="p" fontWeight="semibold">Sidebar Mode</Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Hamburger: hidden by default with a toggle tab.
                    Static: always visible, pushes page content aside.
                  </Text>
                  <ButtonGroup variant="segmented">
                    <Button
                      pressed={sidebarMode === "hamburger"}
                      onClick={() => setSidebarMode("hamburger")}
                    >
                      Hamburger
                    </Button>
                    <Button
                      pressed={sidebarMode === "static"}
                      onClick={() => setSidebarMode("static")}
                    >
                      Static (Always Visible)
                    </Button>
                  </ButtonGroup>
                </BlockStack>

                <Select
                  label="Sidebar Width"
                  options={[
                    { label: "250px — Compact", value: "250" },
                    { label: "280px — Default", value: "280" },
                    { label: "300px — Comfortable", value: "300" },
                    { label: "350px — Wide", value: "350" },
                  ]}
                  value={sidebarWidth}
                  onChange={setSidebarWidth}
                  helpText="Width of the sidebar panel (applies to both modes)"
                />

                <RangeSlider
                  label={`Top Margin: ${topMargin}px`}
                  min={0}
                  max={120}
                  value={topMargin}
                  onChange={setTopMargin}
                  output
                  helpText="Space between the sidebar and the top of the viewport"
                />

                <RangeSlider
                  label={`Bottom Margin: ${bottomMargin}px`}
                  min={0}
                  max={120}
                  value={bottomMargin}
                  onChange={setBottomMargin}
                  output
                  helpText="Space between the sidebar and the bottom of the viewport"
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

                <BlockStack gap="200">
                  <Text variant="bodyMd" as="p" fontWeight="semibold">Accent Color</Text>
                  <Text variant="bodySm" as="p" tone="subdued">Used for focus rings and selected item outlines</Text>
                  <InlineStack gap="300" blockAlign="center">
                    <Box
                      width="32px"
                      minHeight="32px"
                      borderRadius="200"
                      background="bg-surface"
                      style={{ backgroundColor: accentColor, border: "1px solid #ddd" }}
                    />
                    <TextField
                      label=""
                      value={accentColor}
                      onChange={handleAccentColorText}
                      autoComplete="off"
                      maxLength={7}
                      placeholder="#1a1a1a"
                    />
                  </InlineStack>
                  <ColorPicker onChange={handleAccentColorChange} color={accentColorHsb} />
                </BlockStack>

                <Divider />

                <BlockStack gap="200">
                  <Text variant="bodyMd" as="p" fontWeight="semibold">Hover Color</Text>
                  <Text variant="bodySm" as="p" tone="subdued">Used behind items when shoppers hover or select them</Text>
                  <InlineStack gap="300" blockAlign="center">
                    <Box
                      width="32px"
                      minHeight="32px"
                      borderRadius="200"
                      background="bg-surface"
                      style={{ backgroundColor: hoverColor, border: "1px solid #ddd" }}
                    />
                    <TextField
                      label=""
                      value={hoverColor}
                      onChange={handleHoverColorText}
                      autoComplete="off"
                      maxLength={7}
                      placeholder="#f1f2f3"
                    />
                  </InlineStack>
                  <ColorPicker onChange={handleHoverColorChange} color={hoverColorHsb} />
                </BlockStack>

                <Divider />

                <BlockStack gap="200">
                  <Text variant="bodyMd" as="p" fontWeight="semibold">Badge Color</Text>
                  <Text variant="bodySm" as="p" tone="subdued">Used for product badges like Sale or New</Text>
                  <InlineStack gap="300" blockAlign="center">
                    <Box
                      width="32px"
                      minHeight="32px"
                      borderRadius="200"
                      background="bg-surface"
                      style={{ backgroundColor: badgeColor, border: "1px solid #ddd" }}
                    />
                    <TextField
                      label=""
                      value={badgeColor}
                      onChange={handleBadgeColorText}
                      autoComplete="off"
                      maxLength={7}
                      placeholder="#e53e3e"
                    />
                  </InlineStack>
                  <ColorPicker onChange={handleBadgeColorChange} color={badgeColorHsb} />
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
                  helpText="Size of each item icon in the sidebar"
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
                  helpText="How the sidebar appears when opened (hamburger mode only)"
                />
              </BlockStack>
            </Card>

            {/* Page Visibility */}
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Page Visibility</Text>
                <Divider />
                <BlockStack gap="200">
                  <Text variant="bodyMd" as="p" fontWeight="semibold">Show sidebar on</Text>
                  <ButtonGroup variant="segmented">
                    <Button
                      pressed={pageVisibilityMode === "all"}
                      onClick={() => setPageVisibilityMode("all")}
                    >
                      All Pages
                    </Button>
                    <Button
                      pressed={pageVisibilityMode === "specific"}
                      onClick={() => setPageVisibilityMode("specific")}
                    >
                      Specific Pages
                    </Button>
                  </ButtonGroup>
                </BlockStack>

                {pageVisibilityMode === "specific" && (
                  <BlockStack gap="300">
                    <Text variant="bodySm" as="p" tone="subdued">
                      Select the page types where the sidebar should appear.
                    </Text>
                    <Checkbox
                      label="Home page"
                      checked={showOnHome}
                      onChange={setShowOnHome}
                    />
                    <Checkbox
                      label="Collection pages"
                      helpText="Pages like /collections/all"
                      checked={showOnCollection}
                      onChange={setShowOnCollection}
                    />
                    <Checkbox
                      label="Product pages"
                      helpText="Individual product pages"
                      checked={showOnProduct}
                      onChange={setShowOnProduct}
                    />
                    <Checkbox
                      label="Blog pages"
                      helpText="Blog listing pages"
                      checked={showOnBlog}
                      onChange={setShowOnBlog}
                    />
                    <Checkbox
                      label="Article pages"
                      helpText="Individual blog post pages"
                      checked={showOnArticle}
                      onChange={setShowOnArticle}
                    />
                    <Checkbox
                      label="Cart page"
                      checked={showOnCart}
                      onChange={setShowOnCart}
                    />
                    <Checkbox
                      label="Search page"
                      checked={showOnSearch}
                      onChange={setShowOnSearch}
                    />
                    <Checkbox
                      label="Other pages"
                      helpText="Custom pages, 404, etc."
                      checked={showOnOtherPages}
                      onChange={setShowOnOtherPages}
                    />
                  </BlockStack>
                )}
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
              <SidebarPreview
                settings={previewSettings}
                collections={collections}
                products={products}
              />
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
