import { describe, expect, it } from "vitest";
import { getMeetingPlatformName } from "./meetingPlatforms";

describe("getMeetingPlatformName", () => {
  it.each([
    ["teams.microsoft.com", "Teams"],
    ["teams.live.com", "Teams"],
    ["zoom.us", "Zoom"],
    ["meet.google.com", "Google Meet"],
    ["webex.com", "Webex"],
    ["hirevue.com", "HireVue"],
  ])("recognizes %s, its subdomains and uppercase hosts", (host, name) => {
    expect(getMeetingPlatformName(`https://${host}/meeting`)).toBe(name);
    expect(getMeetingPlatformName(`https://app.${host}/meeting`)).toBe(name);
    expect(getMeetingPlatformName(`https://${host.toUpperCase()}/meeting`)).toBe(name);
  });

  it.each([
    "us02web.zoom.us/123",
    "//zoom.us/123",
    "  https://zoom.us/123  ",
    "http://zoom.us/123",
  ])("follows the existing HTTP URL rules for %s", (url) => {
    expect(getMeetingPlatformName(url)).toBe("Zoom");
  });

  it.each([
    "https://example.com",
    "https://zoom.us.evil.com",
    "https://notzoom.us",
    "https://zoom.us@evil.com",
    "https://evil.com/zoom.us",
    "ftp://zoom.us/123",
    "javascript:alert(1)",
    "not a url",
    "https://",
    "",
    "   ",
  ])("returns nothing for %j", (url) => {
    expect(getMeetingPlatformName(url)).toBeUndefined();
  });
});
