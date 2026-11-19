import { getSafeHttpUrl } from "./urls";

const MEETING_PLATFORMS = [
  ["teams.microsoft.com", "Teams"],
  ["teams.live.com", "Teams"],
  ["zoom.us", "Zoom"],
  ["meet.google.com", "Google Meet"],
  ["webex.com", "Webex"],
  ["hirevue.com", "HireVue"],
] as const;

export function getMeetingPlatformName(value: string): string | undefined {
  const href = getSafeHttpUrl(value);
  if (!href) return undefined;

  const host = new URL(href).hostname.toLowerCase();
  return MEETING_PLATFORMS.find(
    ([domain]) => host === domain || host.endsWith(`.${domain}`),
  )?.[1];
}
