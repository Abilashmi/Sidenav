import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useCallback } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Divider,
  Select,
  Checkbox,
  RangeSlider,
  Badge,
  Banner,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { writeSidebarMetafield } from "../metafields.server";

const DEVICE_TYPES = ["desktop", "tablet", "mobile"];

const DEVICE_META = {
  desktop: {
    label: "Desktop",
    screenDesc: "Screens wider than 1024px",
    icon: "🖥",
    color: "#5c6ac4",
  },
  tablet: {
    label: "Tablet",
    screenDesc: "Screens 769px – 1024px",
    icon: "📋",
    color: "#47c1bf",
  },
  mobile: {
    label: "Mobile",
    screenDesc: "Screens up to 768px",
    icon: "📱",
    color: "#f49342",
  },
};

const DEFAULT_DEVICE = {
  enabled: false,
  showOnDevice: true,
  sidebarMode: "inherit",
  position: "inherit",
  overrideWidth: false,
  sidebarWidth: 280,
};

function parseSettings(json, enabled) {
  try {
    return { enabled: !!enabled, ...DEFAULT_DEVICE, ...JSON.parse(json) };
  } catch {
    return { ...DEFAULT_DEVICE, enabled: !!enabled };
  }
}

// Visual diagram showing sidebar placement and mode
function PositionPreview({ position, sidebarMode, showOnDevice }) {
  const resolvedPos  = !position    || position    === "inherit" ? "left"      : position;
  const resolvedMode = !sidebarMode || sidebarMode === "inherit" ? "hamburger" : sidebarMode;
  const isRight = resolvedPos === "right";
  const isStatic = resolvedMode === "static";

  const barColor = showOnDevice ? "#303030" : "#c9cccf";
  const barWidth = isStatic ? "14px" : "6px";

  return (
    <BlockStack gap="100">
      <Text variant="bodySm" as="p" tone="subdued">
        {"Preview — " + (showOnDevice ? resolvedMode + " / " + resolvedPos : "hidden")}
      </Text>
      <div
        style={{
          width: "100%",
          height: "52px",
          background: "#f6f6f7",
          borderRadius: "8px",
          display: "flex",
          alignItems: "stretch",
          overflow: "hidden",
          border: "1px solid #e1e3e5",
        }}
      >
        {!isRight && showOnDevice && (
          <div
            style={{
              width: barWidth,
              background: barColor,
              flexShrink: 0,
              transition: "width 0.2s ease",
            }}
          />
        )}
        <div
          style={{
            flex: 1,
            padding: "8px 10px",
            display: "flex",
            flexDirection: "column",
            gap: "5px",
            justifyContent: "center",
          }}
        >
          <div style={{ height: "5px", background: "#d1d5db", borderRadius: "3px", width: "80%" }} />
          <div style={{ height: "5px", background: "#d1d5db", borderRadius: "3px", width: "55%" }} />
          <div style={{ height: "5px", background: "#d1d5db", borderRadius: "3px", width: "68%" }} />
        </div>
        {isRight && showOnDevice && (
          <div
            style={{
              width: barWidth,
              background: barColor,
              flexShrink: 0,
              transition: "width 0.2s ease",
            }}
          />
        )}
        {!showOnDevice && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          />
        )}
      </div>
    </BlockStack>
  );
}

function DeviceCard({ deviceType, settings, onUpdate, onSave, onReset, isLoading }) {
  const meta = DEVICE_META[deviceType];
  const s = settings;

  const activeOverrides = s.enabled
    ? [
        !s.showOnDevice && "Hidden",
        s.sidebarMode !== "inherit" && s.sidebarMode,
        s.position !== "inherit" && s.position,
        s.overrideWidth && `${s.sidebarWidth}px`,
      ].filter(Boolean)
    : [];

  return (
    <Card>
      <BlockStack gap="400">
        {/* Header */}
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="300" blockAlign="center">
            <div
              style={{
                width: "40px",
                height: "40px",
                background: s.enabled ? meta.color + "18" : "#f1f2f3",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                transition: "background 0.2s ease",
              }}
            >
              {meta.icon}
            </div>
            <BlockStack gap="0">
              <Text variant="headingMd" as="h3">
                {meta.label}
              </Text>
              <Text variant="bodySm" tone="subdued">
                {meta.screenDesc}
              </Text>
            </BlockStack>
          </InlineStack>

          <InlineStack gap="200" blockAlign="center">
            {s.enabled ? (
              <Badge tone="success">Custom</Badge>
            ) : (
              <Badge tone="attention">Global</Badge>
            )}
          </InlineStack>
        </InlineStack>

        {/* Active overrides summary */}
        {activeOverrides.length > 0 && (
          <Box
            background="bg-surface-secondary"
            borderRadius="200"
            padding="200"
          >
            <Text variant="bodySm" tone="subdued">
              Overrides: {activeOverrides.join(" · ")}
            </Text>
          </Box>
        )}

        <Divider />

        {/* Enable toggle */}
        <Checkbox
          label={`Enable ${meta.label.toLowerCase()}-specific settings`}
          helpText="When on, these settings override the global sidebar configuration for this device"
          checked={s.enabled}
          onChange={(val) => onUpdate("enabled", val)}
        />

        {/* Settings — only visible when enabled */}
        {s.enabled && (
          <BlockStack gap="300">
            <Divider />

            {/* Visibility */}
            <Checkbox
              label={`Show sidebar on ${meta.label.toLowerCase()}`}
              helpText="Uncheck to completely hide the sidebar on this device type"
              checked={s.showOnDevice}
              onChange={(val) => onUpdate("showOnDevice", val)}
            />

            {s.showOnDevice && (
              <>
                {/* Sidebar mode */}
                <Select
                  label="Sidebar Mode"
                  options={[
                    { label: "Inherit from global settings", value: "inherit" },
                    { label: "Hamburger — toggle button, hidden by default", value: "hamburger" },
                    { label: "Static — always visible, pushes page content", value: "static" },
                  ]}
                  value={s.sidebarMode}
                  onChange={(val) => onUpdate("sidebarMode", val)}
                />

                {/* Position */}
                <Select
                  label="Position"
                  options={[
                    { label: "Inherit from global settings", value: "inherit" },
                    { label: "Left side", value: "left" },
                    { label: "Right side", value: "right" },
                  ]}
                  value={s.position}
                  onChange={(val) => onUpdate("position", val)}
                />

                {/* Width */}
                <Checkbox
                  label="Custom sidebar width"
                  checked={s.overrideWidth}
                  onChange={(val) => onUpdate("overrideWidth", val)}
                />

                {s.overrideWidth && (
                  <RangeSlider
                    label={`Width: ${s.sidebarWidth}px`}
                    min={200}
                    max={420}
                    step={10}
                    value={s.sidebarWidth}
                    onChange={(val) => onUpdate("sidebarWidth", val)}
                    output
                  />
                )}
              </>
            )}

            {/* Position preview */}
            <PositionPreview
              position={s.position}
              sidebarMode={s.sidebarMode}
              showOnDevice={s.showOnDevice}
            />
          </BlockStack>
        )}

        {!s.enabled && (
          <Box
            background="bg-surface-secondary"
            borderRadius="200"
            padding="300"
          >
            <Text variant="bodySm" tone="subdued" alignment="center">
              Using global sidebar settings for {meta.label.toLowerCase()}
            </Text>
          </Box>
        )}

        <Divider />

        {/* Actions */}
        <InlineStack gap="200">
          <Button
            variant="primary"
            size="slim"
            onClick={onSave}
            loading={isLoading}
          >
            Save {meta.label}
          </Button>
          {s.enabled && (
            <Button variant="tertiary" size="slim" onClick={onReset}>
              Reset to Global
            </Button>
          )}
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { shop: session.shop },
    include: { deviceSettings: true },
  });
  return json({
    deviceSettings: shop?.deviceSettings ?? [],
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const shop = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  if (intent === "save-device") {
    const deviceType = formData.get("deviceType");
    const enabled = formData.get("enabled") === "true";
    const settingsJson = formData.get("settingsJson");
    await prisma.deviceNavigationSettings.upsert({
      where: { shopId_deviceType: { shopId: shop.id, deviceType } },
      update: { settingsJson, enabled },
      create: { shopId: shop.id, deviceType, settingsJson, enabled },
    });
  } else if (intent === "save-all") {
    for (const dt of DEVICE_TYPES) {
      const enabled = formData.get(`${dt}_enabled`) === "true";
      const settingsJson = formData.get(`${dt}_settings`);
      await prisma.deviceNavigationSettings.upsert({
        where: { shopId_deviceType: { shopId: shop.id, deviceType: dt } },
        update: { settingsJson, enabled },
        create: { shopId: shop.id, deviceType: dt, settingsJson, enabled },
      });
    }
  } else if (intent === "reset-device") {
    const deviceType = formData.get("deviceType");
    await prisma.deviceNavigationSettings.deleteMany({
      where: { shopId: shop.id, deviceType },
    });
  }

  await writeSidebarMetafield(admin, session.shop);
  return json({ success: true });
};

export default function DevicePage() {
  const { deviceSettings } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isLoading = navigation.state === "submitting";

  const [settings, setSettings] = useState(() => {
    const result = {};
    DEVICE_TYPES.forEach((dt) => {
      const existing = deviceSettings.find((d) => d.deviceType === dt);
      result[dt] = parseSettings(existing?.settingsJson ?? "{}", existing?.enabled ?? false);
    });
    return result;
  });

  const updateDevice = useCallback((device, key, value) => {
    setSettings((prev) => ({
      ...prev,
      [device]: { ...prev[device], [key]: value },
    }));
  }, []);

  const buildSettingsJson = (s) =>
    JSON.stringify({
      showOnDevice: s.showOnDevice,
      sidebarMode: s.sidebarMode,
      position: s.position,
      overrideWidth: s.overrideWidth,
      sidebarWidth: s.overrideWidth ? s.sidebarWidth : null,
    });

  const handleSaveDevice = useCallback(
    (deviceType) => {
      const s = settings[deviceType];
      const fd = new FormData();
      fd.append("intent", "save-device");
      fd.append("deviceType", deviceType);
      fd.append("enabled", String(s.enabled));
      fd.append("settingsJson", buildSettingsJson(s));
      submit(fd, { method: "post" });
      shopify.toast.show(`${DEVICE_META[deviceType].label} settings saved!`);
    },
    [settings, submit, shopify]
  );

  const handleSaveAll = useCallback(() => {
    const fd = new FormData();
    fd.append("intent", "save-all");
    DEVICE_TYPES.forEach((dt) => {
      const s = settings[dt];
      fd.append(`${dt}_enabled`, String(s.enabled));
      fd.append(`${dt}_settings`, buildSettingsJson(s));
    });
    submit(fd, { method: "post" });
    shopify.toast.show("All device settings saved!");
  }, [settings, submit, shopify]);

  const handleResetDevice = useCallback(
    (deviceType) => {
      const fd = new FormData();
      fd.append("intent", "reset-device");
      fd.append("deviceType", deviceType);
      submit(fd, { method: "post" });
      setSettings((prev) => ({
        ...prev,
        [deviceType]: { ...DEFAULT_DEVICE },
      }));
      shopify.toast.show(`${DEVICE_META[deviceType].label} reset to global defaults`);
    },
    [submit, shopify]
  );

  const customCount = DEVICE_TYPES.filter((dt) => settings[dt].enabled).length;

  return (
    <Page
      title="Device Navigation"
      subtitle="Configure different sidebar behavior for desktop, tablet, and mobile"
      primaryAction={{
        content: "Save All Devices",
        onAction: handleSaveAll,
        loading: isLoading,
      }}
    >
      <BlockStack gap="400">
        {customCount > 0 ? (
          <Banner tone="success">
            {customCount} of 3 device{customCount > 1 ? "s have" : " has"} custom settings active.
            Device-specific settings override the global configuration.
          </Banner>
        ) : (
          <Banner tone="info">
            No device-specific overrides are active. All devices use the global sidebar
            settings from the Settings page.
          </Banner>
        )}

        <Layout>
          {DEVICE_TYPES.map((dt) => (
            <Layout.Section key={dt} variant="oneThird">
              <DeviceCard
                deviceType={dt}
                settings={settings[dt]}
                onUpdate={(key, val) => updateDevice(dt, key, val)}
                onSave={() => handleSaveDevice(dt)}
                onReset={() => handleResetDevice(dt)}
                isLoading={isLoading}
              />
            </Layout.Section>
          ))}
        </Layout>

        {false && globalSettings && (
          <Card>
            <BlockStack gap="300">
              <InlineStack gap="600">
                <BlockStack gap="050">
                  <Text variant="bodySm" tone="subdued">Mode</Text>
                  <Text variant="bodyMd" fontWeight="semibold">{globalSettings.sidebarMode || "hamburger"}</Text>
                </BlockStack>
                <BlockStack gap="050">
                  <Text variant="bodySm" tone="subdued">Position</Text>
                  <Text variant="bodyMd" fontWeight="semibold">{globalSettings.position || "left"}</Text>
                </BlockStack>
                <BlockStack gap="050">
                  <Text variant="bodySm" tone="subdued">Width</Text>
                  <Text variant="bodyMd" fontWeight="semibold">{globalSettings.sidebarWidth || 280}px</Text>
                </BlockStack>
                <BlockStack gap="050">
                  <Text variant="bodySm" tone="subdued">Mobile Only</Text>
                  <Text variant="bodyMd" fontWeight="semibold">{globalSettings.mobileOnly ? "Yes" : "No"}</Text>
                </BlockStack>
              </InlineStack>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
