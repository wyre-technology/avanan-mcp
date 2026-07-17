/**
 * Iframe bridge + renderer for the Avanan security event card
 * (MCP Apps, SEP-1865).
 *
 * Runs inside the host's sandboxed iframe. Uses the official MCP Apps client
 * (`App`) to receive the hec_get_event tool result from the host. The card is
 * read-only by policy: remediation actions are listed informationally and run
 * through the chat tools, never from the card.
 *
 * The server attaches a normalized `_card` payload to hec_get_event results
 * (see src/card.builder.ts) so this renderer never needs to interpret raw
 * HEC event objects itself.
 *
 * Rendering uses DOM construction (no innerHTML) — event descriptions and
 * subjects are attacker-influenced email-security data, so text only ever
 * lands in text nodes.
 *
 * Branding: the card is neutral by default (this is a published server) and
 * applies an injected `window.__BRAND__` override — set by the server from
 * MCP_BRAND_* env vars at serve time, or by a gateway per-org — so the same
 * card can render in any operator's brand.
 */
import { App } from "@modelcontextprotocol/ext-apps";

interface Brand {
  name?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  bg?: string;
  text?: string;
}
declare global {
  interface Window {
    __BRAND__?: Brand;
  }
}

/** Mirror of EventCard in src/card.builder.ts — keep in sync. */
interface EventCard {
  eventId: string;
  title: string;
  severity?: string;
  state?: string;
  confidence?: string;
  saas?: string;
  detected?: string;
  description?: string;
  actionsTaken: string[];
  availableActions: string[];
}

const brand: Brand = window.__BRAND__ ?? {};

// Apply any injected brand overrides onto the CSS custom properties.
function applyBrand(): void {
  const root = document.documentElement.style;
  if (brand.primaryColor) root.setProperty("--brand-primary", brand.primaryColor);
  if (brand.accentColor) root.setProperty("--brand-accent", brand.accentColor);
  if (brand.bg) root.setProperty("--brand-bg", brand.bg);
  if (brand.text) root.setProperty("--brand-text", brand.text);
}

const app = new App({ name: "Avanan Security Event Card", version: "1.0.0" });

/** Create an element with a class and (safe, text-node) children. */
function el(
  tag: string,
  className = "",
  ...children: Array<Node | string | null>
): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) {
    if (child == null) continue;
    node.append(child); // strings become text nodes — never parsed as HTML
  }
  return node;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function field(label: string, value: string | undefined): HTMLElement | null {
  if (!value) return null;
  return el(
    "div",
    "field",
    el("div", "field__label", label),
    el("div", "field__value", value),
  );
}

function badge(text: string | undefined, cls: string): HTMLElement | null {
  return text ? el("span", `badge ${cls}`, text) : null;
}

function chips(labels: string[], cls: string): HTMLElement | null {
  if (labels.length === 0) return null;
  return el("div", "chips", ...labels.map((label) => el("span", `chip ${cls}`, label)));
}

function render(e: EventCard): void {
  // Empty when no brand is injected — the span still occupies the flex slot
  // so the source label stays right-aligned.
  const brandId = el("span", "brandid");
  if (brand.logoUrl) {
    const logo = document.createElement("img");
    logo.src = brand.logoUrl;
    logo.alt = brand.name ?? "";
    logo.style.display = "inline-block";
    brandId.append(logo);
  }
  if (brand.name) brandId.append(el("span", "brand", brand.name));

  let actionsSection: HTMLElement | null = null;
  if (e.actionsTaken.length > 0 || e.availableActions.length > 0) {
    actionsSection = el("div", "actions");
    if (e.actionsTaken.length > 0) {
      actionsSection.append(
        el("div", "actions__h", "Actions taken"),
        chips(e.actionsTaken, "chip--taken")!,
      );
    }
    if (e.availableActions.length > 0) {
      actionsSection.append(
        el("div", "actions__h", "Available remediation"),
        chips(e.availableActions, "")!,
        el("div", "actions__hint", "Run remediation from chat — this card is read-only."),
      );
    }
  }

  const body = el(
    "div",
    "card__body",
    el("div", "brandrow", brandId, el("span", "source", "Harmony Email Security Event")),
    el("h1", "", e.title),
    el(
      "div",
      "badges",
      badge(e.severity && `${e.severity} severity`, "badge--sev"),
      badge(e.state, "badge--state"),
      badge(e.confidence, ""),
    ),
    e.description ? el("div", "desc", e.description) : null,
    el(
      "div",
      "grid",
      field("Platform", e.saas),
      field("Detected", e.detected && fmtDate(e.detected)),
      field("Event ID", e.eventId),
    ),
    actionsSection,
  );

  const root = document.getElementById("root")!;
  root.replaceChildren(el("div", "card", el("div", "card__bar"), body));
}

// hec_get_event results are "Found 1 event." header lines followed by a JSON
// summary array; the normalized card rides on the first element as `_card`
// (see src/utils/format.ts and src/tools/events.ts).
function extractCard(text: string): EventCard | null {
  const start = text.indexOf("[");
  if (start === -1) return null;
  try {
    const parsed = JSON.parse(text.slice(start)) as Array<{ _card?: EventCard }>;
    const card = Array.isArray(parsed) ? parsed[0]?._card : undefined;
    return card && typeof card.eventId === "string" && card.title ? card : null;
  } catch {
    return null; // malformed payload — render nothing
  }
}

applyBrand();

// Must be set before connect() so the initial tool-result isn't missed.
app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
  const payload = (result.content ?? []).find((c) => c.type === "text");
  if (!payload?.text) return;
  const card = extractCard(payload.text);
  if (card) render(card);
};

app.connect();
