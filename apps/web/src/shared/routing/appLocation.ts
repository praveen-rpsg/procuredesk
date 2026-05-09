import { useEffect, useState } from "react";

const appLocationChangeEvent = "procuredesk:location-change";

export type AppLocation = {
  pathname: string;
  search: string;
};

export function navigateToAppPath(path: string, options: { replace?: boolean } = {}) {
  const nextUrl = normalizeTargetPath(path);
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl === currentUrl) return;

  if (options.replace) {
    window.history.replaceState({}, "", nextUrl);
  } else {
    window.history.pushState({}, "", nextUrl);
  }
  window.dispatchEvent(new Event(appLocationChangeEvent));
}

export function useAppLocation(): AppLocation {
  const [location, setLocation] = useState(readAppLocation);

  useEffect(() => {
    const syncLocation = () => setLocation(readAppLocation());
    window.addEventListener("popstate", syncLocation);
    window.addEventListener(appLocationChangeEvent, syncLocation);
    return () => {
      window.removeEventListener("popstate", syncLocation);
      window.removeEventListener(appLocationChangeEvent, syncLocation);
    };
  }, []);

  return location;
}

function readAppLocation(): AppLocation {
  return {
    pathname: normalizePathname(window.location.pathname),
    search: window.location.search,
  };
}

function normalizeTargetPath(path: string) {
  if (!path.startsWith("/")) return `/${path}`;
  return path;
}

function normalizePathname(pathname: string) {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}
