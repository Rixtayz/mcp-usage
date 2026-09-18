import { describe, expect, it } from "vitest";
import { displayLabel, isHostProvided, mangleServerId, parseToolName } from "../src/names.js";

describe("parseToolName", () => {
  it.each([
    ["mcp__claude_ai_Firecrawl_v2__firecrawl_search", "claude_ai_Firecrawl_v2", "firecrawl_search"],
    ["mcp__plugin_playwright_playwright__browser_navigate", "plugin_playwright_playwright", "browser_navigate"],
    ["mcp__0a1b2c3d-1111-4222-8333-444455556666__pr_add_marker", "0a1b2c3d-1111-4222-8333-444455556666", "pr_add_marker"],
    ["mcp__plugin_small-business_shopify__search__docs", "plugin_small-business_shopify", "search__docs"],
    ["mcp__9f8e7d6c__apify--instagram-scraper", "9f8e7d6c", "apify--instagram-scraper"],
    ["mcp__claude_ai_Context7__query-docs", "claude_ai_Context7", "query-docs"],
  ])("splits %s on the first double underscore", (name, server, tool) => {
    expect(parseToolName(name)).toEqual({ server, tool });
  });

  it.each(["Bash", "mcp__", "mcp__server", "mcp__server__", "mcp____tool", "xmcp__a__b", ""])(
    "returns null for %j",
    (name) => {
      expect(parseToolName(name)).toBeNull();
    },
  );
});

describe("mangleServerId", () => {
  it.each([
    ["claude.ai Context7", "claude_ai_Context7"],
    ["plugin:small-business:shopify", "plugin_small-business_shopify"],
    ["plugin:playwright:playwright", "plugin_playwright_playwright"],
    ["0a1b2c3d-1111-4222-8333-444455556666", "0a1b2c3d-1111-4222-8333-444455556666"],
    ["claude-in-chrome", "claude-in-chrome"],
  ])("maps %s to %s", (canonical, mangled) => {
    expect(mangleServerId(canonical)).toBe(mangled);
  });
});

describe("displayLabel", () => {
  it.each([
    ["claude_ai_Gmail", "claude.ai Gmail"],
    ["claude_ai_Google_Drive", "claude.ai Google Drive"],
    ["plugin_small-business_gmail", "plugin:small-business:gmail"],
    ["plugin_playwright_playwright", "plugin:playwright:playwright"],
    ["plugin_a_b_c", "plugin_a_b_c"],
    ["0a1b2c3d-1111-4222-8333-444455556666", "0a1b2c3d-1111-4222-8333-444455556666"],
    ["ccd_session_mgmt", "ccd_session_mgmt"],
  ])("guesses a readable label for %s", (server, label) => {
    expect(displayLabel(server)).toBe(label);
  });
});

describe("isHostProvided", () => {
  it("recognizes servers bundled with the Claude desktop app", () => {
    expect(isHostProvided("ccd_session_mgmt")).toBe(true);
    expect(isHostProvided("claude_ai_Gmail")).toBe(false);
  });
});
