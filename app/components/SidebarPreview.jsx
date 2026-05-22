import { useState } from "react";
import { Box, Text, BlockStack } from "@shopify/polaris";

const PLACEHOLDER_IMAGE =
  "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1.png";

const TOGGLE_W = 36; // px — matches #fsn-toggle width in sidebar.css

export default function SidebarPreview({ settings, collections = [] }) {
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
  } = settings || {};

  const isRight = position === "right";

  const displayCollections =
    collections.length > 0
      ? collections.slice(0, 8)
      : [
          { id: "1", title: "Men",   image: null, handle: "men" },
          { id: "2", title: "Women", image: null, handle: "women" },
          { id: "3", title: "Sale",  image: null, handle: "sale" },
        ];

  /* ---- Wrapper ---- */
  const wrapperStyle = {
    display: "flex",
    flexDirection: isRight ? "row-reverse" : "row",
    backgroundColor: "#f0f0f0",
    borderRadius: "8px",
    minHeight: "300px",
    overflow: "hidden",
    position: "relative",
  };

  /* ---- Toggle tab ---- */
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
    position: "relative",
    transition: "opacity 0.2s ease",
  };

  /* ---- Sliding sidebar (uses overflow-clip + max-width trick) ---- */
  const sidebarClipStyle = {
    overflow: "hidden",
    maxWidth: isOpen ? `${iconSize + TOGGLE_W}px` : "0px",
    transition: "max-width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
    flexShrink: 0,
    display: "flex",
  };

  const sidebarInnerStyle = {
    width: `${iconSize + TOGGLE_W}px`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    padding: "12px 8px",
    background: backgroundColor,
    opacity,
    boxShadow: shadow
      ? isRight
        ? "-2px 0 20px rgba(0,0,0,0.15)"
        : "2px 0 20px rgba(0,0,0,0.15)"
      : "none",
    overflowY: "auto",
    maxHeight: "300px",
    scrollbarWidth: "none",
    flexShrink: 0,
  };

  /* ---- Storefront mock ---- */
  const storeFrontStyle = {
    flex: 1,
    background: "#e0e0e0",
    borderRadius: "6px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "8px",
  };

  /* ---- Item icon ---- */
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

  /* ---- Disabled state ---- */
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

  /* ---- Icons for the toggle ---- */
  const BarsIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="3" y1="7"  x2="21" y2="7"  />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="17" x2="21" y2="17" />
    </svg>
  );

  const CloseIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="6"  y1="6"  x2="18" y2="18" />
      <line x1="18" y1="6"  x2="6"  y2="18" />
    </svg>
  );

  return (
    <BlockStack gap="200">
      <div style={wrapperStyle}>
        {/* Toggle tab — always visible at the edge */}
        <button
          type="button"
          style={toggleStyle}
          onClick={() => setIsOpen((v) => !v)}
          title={isOpen ? "Close sidebar" : "Open sidebar"}
          aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
        >
          {isOpen ? CloseIcon : BarsIcon}
        </button>

        {/* Sidebar content — clips open/closed via max-width */}
        <div style={sidebarClipStyle}>
          <div style={sidebarInnerStyle}>
            {displayCollections.map((col) => (
              <div
                key={col.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                  width: "100%",
                }}
              >
                <div style={iconStyle}>
                  <img
                    src={col.image || PLACEHOLDER_IMAGE}
                    alt={col.title}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    loading="lazy"
                  />
                </div>
                <span style={labelStyle}>{col.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Storefront mock */}
        <div style={storeFrontStyle}>
          <Text variant="bodySm" tone="subdued" as="p">Storefront Preview</Text>
        </div>
      </div>

      <Text variant="bodySm" tone="subdued" as="p" alignment="center">
        Click the {isRight ? "right" : "left"} tab to {isOpen ? "close" : "open"} the sidebar
      </Text>
    </BlockStack>
  );
}
