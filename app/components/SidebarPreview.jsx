import { useState, useMemo } from "react";
import { Box, Text, BlockStack, Badge } from "@shopify/polaris";

const PLACEHOLDER_IMAGE =
  "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1.png";

const TOGGLE_W = 36;

const DEFAULT_COLLECTIONS = [
  { id: "1", title: "Men",   image: null, handle: "men",   type: "collection" },
  { id: "2", title: "Women", image: null, handle: "women", type: "collection" },
  { id: "3", title: "Sale",  image: null, handle: "sale",  type: "collection" },
];

export default function SidebarPreview({ settings, collections = [], products = [] }) {
  const [isOpen, setIsOpen] = useState(false);

  const {
    enabled         = true,
    position        = "left",
    backgroundColor = "#ffffff",
    textColor       = "#1a1a1a",
    borderRadius    = 12,
    shadow          = true,
    iconSize        = 56,
    opacity         = 1,
    sidebarMode     = "hamburger",
    sidebarWidth    = 280,
    topMargin       = 20,
    bottomMargin    = 20,
  } = settings || {};

  const isRight  = position === "right";
  const isStatic = sidebarMode === "static";

  // Merge collections + products for preview (collections first, then products)
  const displayItems = useMemo(() => {
    const cols =
      collections.length > 0
        ? collections.slice(0, 6).map((c) => ({ ...c, type: "collection" }))
        : DEFAULT_COLLECTIONS;
    const prods = products.slice(0, 4).map((p) => ({ ...p, type: "product" }));
    return [...cols, ...prods];
  }, [collections, products]);

  const boxShadow = shadow
    ? isRight
      ? "-2px 0 20px rgba(0,0,0,0.15)"
      : "2px 0 20px rgba(0,0,0,0.15)"
    : "none";

  /* ── Disabled ── */
  if (!enabled) {
    return (
      <Box padding="400" background="bg-surface-secondary" borderRadius="200">
        <BlockStack gap="200" inlineAlign="center">
          <Text variant="bodySm" tone="subdued" as="p">
            Sidebar is disabled. Enable it in Settings.
          </Text>
        </BlockStack>
      </Box>
    );
  }

  /* ── Static mode preview ── */
  if (isStatic) {
    // Match the actual storefront: narrow icon dock = iconSize + 20px
    const previewIconSize = Math.min(iconSize, 40);
    const dockWidth = previewIconSize + 20;

    const wrapperStyle = {
      display: "flex",
      flexDirection: isRight ? "row-reverse" : "row",
      backgroundColor: "#f0f0f0",
      borderRadius: "8px",
      minHeight: "300px",
      overflow: "hidden",
    };
    const sidebarStyle = {
      width: `${dockWidth}px`,
      flexShrink: 0,
      background: backgroundColor,
      opacity,
      boxShadow,
      borderRadius: isRight
        ? `${borderRadius}px 0 0 ${borderRadius}px`
        : `0 ${borderRadius}px ${borderRadius}px 0`,
      overflowY: "auto",
      maxHeight: "300px",
      padding: "6px 4px",
      scrollbarWidth: "none",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "6px",
    };
    const contentStyle = {
      flex: 1,
      background: "#e0e0e0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      margin: "8px",
      borderRadius: "6px",
    };
    return (
      <BlockStack gap="200">
        <div style={wrapperStyle}>
          <div style={sidebarStyle}>
            {displayItems.map((item, i) => (
              <StaticItem
                key={item.id || i}
                item={item}
                iconSize={previewIconSize}
                textColor={textColor}
                borderRadius={borderRadius}
              />
            ))}
          </div>
          <div style={contentStyle}>
            <Text variant="bodySm" tone="subdued" as="p">Storefront</Text>
          </div>
        </div>
        <Text variant="bodySm" tone="subdued" as="p" alignment="center">
          Static mode — sidebar always visible
        </Text>
      </BlockStack>
    );
  }

  /* ── Hamburger mode preview ── */
  const wrapperStyle = {
    display: "flex",
    flexDirection: isRight ? "row-reverse" : "row",
    backgroundColor: "#f0f0f0",
    borderRadius: "8px",
    minHeight: "300px",
    overflow: "hidden",
    position: "relative",
  };

  const toggleStyle = {
    flexShrink: 0,
    width: `${TOGGLE_W}px`,
    alignSelf: "center",
    height: "52px",
    background: backgroundColor,
    color: textColor,
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: isRight
      ? `${borderRadius}px 0 0 ${borderRadius}px`
      : `0 ${borderRadius}px ${borderRadius}px 0`,
    boxShadow: shadow
      ? isRight
        ? "-2px 2px 10px rgba(0,0,0,0.18)"
        : "2px 2px 10px rgba(0,0,0,0.18)"
      : "none",
    zIndex: 2,
    transition: "opacity 0.2s ease",
  };

  const clipStyle = {
    overflow: "hidden",
    maxWidth: isOpen ? `${iconSize + TOGGLE_W}px` : "0px",
    transition: "max-width 0.35s cubic-bezier(0.34,1.56,0.64,1)",
    flexShrink: 0,
    display: "flex",
  };

  const innerStyle = {
    width: `${iconSize + TOGGLE_W}px`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    padding: "12px 8px",
    background: backgroundColor,
    opacity,
    boxShadow,
    overflowY: "auto",
    maxHeight: "300px",
    scrollbarWidth: "none",
    flexShrink: 0,
  };

  const iconStyle = {
    width: `${iconSize}px`,
    height: `${iconSize}px`,
    borderRadius: `${Math.max(4, borderRadius - 4)}px`,
    overflow: "hidden",
    flexShrink: 0,
    background: "#f0f0f0",
  };

  const labelStyle = {
    fontSize: "10px",
    color: textColor,
    textAlign: "center",
    maxWidth: `${iconSize}px`,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    lineHeight: "1.2",
  };

  const BarsIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="3" y1="7" x2="21" y2="7" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="17" x2="21" y2="17" />
    </svg>
  );
  const CloseIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );

  return (
    <BlockStack gap="200">
      <div style={wrapperStyle}>
        <button
          type="button"
          style={toggleStyle}
          onClick={() => setIsOpen((v) => !v)}
          aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
        >
          {isOpen ? CloseIcon : BarsIcon}
        </button>

        <div style={clipStyle}>
          <div style={innerStyle}>
            {displayItems.map((item, i) => (
              <div
                key={item.id || i}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: "100%" }}
              >
                <div style={iconStyle}>
                  <img
                    src={item.image || PLACEHOLDER_IMAGE}
                    alt={item.label || item.title}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    loading="lazy"
                  />
                </div>
                <span style={labelStyle}>{item.label || item.title}</span>
                {item.type === "product" && item.badge && (
                  <span style={{
                    fontSize: "8px", fontWeight: 700, padding: "1px 4px",
                    background: "#e53e3e", color: "#fff", borderRadius: "3px",
                    letterSpacing: "0.5px", textTransform: "uppercase",
                  }}>
                    {item.badge}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{
          flex: 1, background: "#e0e0e0", borderRadius: "6px",
          display: "flex", alignItems: "center", justifyContent: "center", margin: "8px",
        }}>
          <Text variant="bodySm" tone="subdued" as="p">Storefront Preview</Text>
        </div>
      </div>

      <Text variant="bodySm" tone="subdued" as="p" alignment="center">
        Click the {isRight ? "right" : "left"} tab to {isOpen ? "close" : "open"} the sidebar
      </Text>
    </BlockStack>
  );
}

function StaticItem({ item, iconSize, textColor, borderRadius }) {
  const displayName = item.label || item.title;
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "3px",
      padding: "4px 3px",
      borderRadius: "6px",
      cursor: "pointer",
      width: "100%",
    }}>
      <div style={{
        width: iconSize, height: iconSize, flexShrink: 0,
        borderRadius: `${Math.max(3, borderRadius - 4)}px`,
        overflow: "hidden", background: "#f0f0f0",
      }}>
        <img
          src={item.image || PLACEHOLDER_IMAGE}
          alt={displayName}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          loading="lazy"
        />
      </div>
      <div style={{
        fontSize: "9px", fontWeight: 400, color: textColor,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        textAlign: "center", maxWidth: `${iconSize}px`, lineHeight: "1.2",
      }}>
        {displayName}
      </div>
      {item.type === "product" && item.price && (
        <div style={{ fontSize: "8px", color: textColor, opacity: 0.65, textAlign: "center" }}>
          ${item.price}
        </div>
      )}
      {item.type === "product" && item.badge && (
        <span style={{
          fontSize: "7px", fontWeight: 700, padding: "1px 3px",
          background: "#e53e3e", color: "#fff", borderRadius: "3px",
          letterSpacing: "0.5px", textTransform: "uppercase",
          display: "inline-block",
        }}>
          {item.badge}
        </span>
      )}
    </div>
  );
}
