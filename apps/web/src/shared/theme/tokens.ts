export const themeTokens = {
  color: {
    ink: "#102027",
    deepTeal: "#0d3b45",
    teal: "#11606d",
    blue: "#2563eb",
    emerald: "#059669",
    amber: "#d97706",
    red: "#dc2626",
    surface: "#ffffff",
    background: "#f6f8fb",
    border: "#d8e0e8",
    muted: "#64748b",
  },
  font: {
    family:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    size: {
      xs: "12px",
      sm: "13px",
      md: "14px",
      lg: "18px",
      xl: "20px",
      xxl: "28px",
    },
    weight: {
      regular: 400,
      medium: 600,
      bold: 700,
      heavy: 800,
    },
  },
  radius: {
    sm: "4px",
    md: "6px",
    lg: "8px",
  },
  shadow: {
    panel: "0 1px 3px rgba(15, 23, 42, 0.08)",
    overlay: "0 18px 45px rgba(15, 23, 42, 0.18)",
  },
  spacing: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    7: "28px",
    8: "32px",
  },
  zIndex: {
    base: 0,
    dropdown: 20,
    overlay: 50,
    modal: 60,
    toast: 80,
  },
} as const;
