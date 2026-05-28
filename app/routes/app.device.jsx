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
  Tabs,
  Banner,
  Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { writeSidebarMetafield } from "../metafields.server";

const DEVICE_TYPES = ["desktop", "tablet", "mobile"];

const DEVICE_LABELS = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

const DEVICE_DESCRIPTIONS = {
  desktop: "Screens wider than 1024px",
  tablet: "Screens between 769px – 1024px",
  mobile: "Screens up to 768px",
};

const DEFAULT_DEVICE = {
  showOnDevice: true,
  sidebarMode: "inherit",
  position: "inherit",
  overrideWidth: false,
  sidebarWidth: 280,
};

function parseSettings(json) {
  try {
    return { ...DEFAULT_DEVICE, ...JSON.parse(json) };
  } catch {
    return { ...DEFAULT_DEVICE };
  }
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { shop: session.shop },
    include: {
      deviceSettings: true,
      settings: true,
    },
  });
  return json({
    deviceSettings: shop?.deviceSettings ?? [],
    globalSettings: shop?.settings ?? null,
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
  const { deviceSettings, globalSettings } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isLoading = navigation.state === "submitting";

  const [selectedTab, setSelectedTab] = useState(0);

  const [settings, setSettings] = useState(() => {
    const result = {};
    DEVICE_TYPES.forEach((dt) => {
      const existing = deviceSettings.find((d) => d.deviceType === dt);
      result[dt] = {
        enabled: existing ? existing.enabled : false,
        ...parseSettings(existing?.settingsJson ?? "{}"),
      };
    });
    return result;
  });

  const update = useCallback((device, key, value) => {
    setSettings((prev) => ({
      ...prev,
      [device]: { ...prev[device], [key]: value },
    }));
  }, []);

  const handleSave = useCallback(
    (deviceType) => {
      const s = settings[deviceType];
      const settingsJson = JSON.stringify({
        showOnDevice: s.showOnDevice,
        sidebarMode: s.sidebarMode,
        position: s.position,
        overrideWidth: s.overrideWidth,
        sidebarWidth: s.overrideWidth ? s.sidebarWidth : null,
      });
      const fd = new FormData();
      fd.append("intent", "save-device");
      fd.append("deviceType", deviceType);
      fd.append("enabled", String(s.enabled));
      fd.append("settingsJson", settingsJson);
      submit(fd, { method: "post" });
      shopify.toast.show(`${DEVICE_LABELS[deviceType]} settings saved!`);
    },
    [settings, submit, shopify]
  );

  const handleReset = useCallback(
    (deviceType) => {
      const fd = new FormData();
      fd.append("intent", "reset-device");
      fd.append("deviceType", deviceType);
      submit(fd, { method: "post" });
      setSettings((prev) => ({
        ...prev,
        [deviceType]: { enabled: false, ...DEFAULT_DEVICE },
      }));
      shopify.toast.show(`${DEVICE_LABELS[deviceType]} settings reset to global defaults`);
    },
    [submit, shopify]
  );

  const tabs = DEVICE_TYPES.map((dt, i) => ({
    id: dt,
    content: (
      <InlineStack gap="150" blockAlign="center">
        <span>{DEVICE_LABELS[dt]}</span>
        {settings[dt].enabled && <Badge tone="success" size="small">On</Badge>}
      </InlineStack>
    ),
    panelID: `panel-${dt}`,
  }));

  const currentDevice = DEVICE_TYPES[selectedTab];
  const s = settings[currentDevice];

  return (
    <Page
      title="Device Navigation"
      subtitle="Configure different sidebar behavior for desktop, tablet, and mobile devices"
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              Device-specific settings override your global sidebar settings. If a device has
              settings disabled, the global configuration is used instead.
            </Banner>

            <Card>
              <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                <BlockStack gap="400" padding="400">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      {DEVICE_LABELS[currentDevice]} Settings
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      {DEVICE_DESCRIPTIONS[currentDevice]}
                    </Text>
                  </BlockStack>
                  <Divider />

                  <Checkbox
                    label={`Enable ${DEVICE_LABELS[currentDevice]}-specific overrides`}
                    helpText="When enabled, the settings below override your global sidebar settings for this device"
                    checked={s.enabled}
                    onChange={(val) => update(currentDevice, "enabled", val)}
                  />

                  {s.enabled && (
                    <BlockStack gap="400">
                      <Divider />

                      <Checkbox
                        label={`Show sidebar on ${DEVICE_LABELS[currentDevice].toLowerCase()}`}
                        helpText="Uncheck to completely hide the sidebar on this device type"
                        checked={s.showOnDevice}
                        onChange={(val) => update(currentDevice, "showOnDevice", val)}
                      />

                      {s.showOnDevice && (
                        <>
                          <Select
                            label="Sidebar Mode"
                            options={[
                              { label: "Inherit from global settings", value: "inherit" },
                              { label: "Hamburger — hidden by default with toggle", value: "hamburger" },
                              { label: "Static — always visible", value: "static" },
                            ]}
                            value={s.sidebarMode}
                            onChange={(val) => update(currentDevice, "sidebarMode", val)}
                            helpText="Override the sidebar display mode for this device"
                          />

                          <Select
                            label="Position"
                            options={[
                              { label: "Inherit from global settings", value: "inherit" },
                              { label: "Left side", value: "left" },
                              { label: "Right side", value: "right" },
                            ]}
                            value={s.position}
                            onChange={(val) => update(currentDevice, "position", val)}
                            helpText="Override sidebar position for this device"
                          />

                          <Checkbox
                            label="Override sidebar width"
                            checked={s.overrideWidth}
                            onChange={(val) => update(currentDevice, "overrideWidth", val)}
                          />

                          {s.overrideWidth && (
                            <RangeSlider
                              label={`Width: ${s.sidebarWidth}px`}
                              min={200}
                              max={420}
                              step={10}
                              value={s.sidebarWidth}
                              onChange={(val) => update(currentDevice, "sidebarWidth", val)}
                              output
                              helpText="Custom sidebar width for this device"
                            />
                          )}
                        </>
                      )}
                    </BlockStack>
                  )}

                  <Divider />
                  <InlineStack gap="300">
                    <Button
                      variant="primary"
                      onClick={() => handleSave(currentDevice)}
                      loading={isLoading}
                    >
                      Save {DEVICE_LABELS[currentDevice]} Settings
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleReset(currentDevice)}
                    >
                      Reset to Global
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Tabs>
            </Card>

            {globalSettings && (
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">
                    Current Global Settings
                  </Text>
                  <Divider />
                  <Text variant="bodySm" as="p" tone="subdued">
                    These are applied to all devices unless a device-specific override is enabled.
                  </Text>
                  <InlineStack gap="400">
                    <Text variant="bodySm" as="p">
                      Mode: <strong>{globalSettings.sidebarMode || "hamburger"}</strong>
                    </Text>
                    <Text variant="bodySm" as="p">
                      Position: <strong>{globalSettings.position || "left"}</strong>
                    </Text>
                    <Text variant="bodySm" as="p">
                      Width: <strong>{globalSettings.sidebarWidth || 280}px</strong>
                    </Text>
                  </InlineStack>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
