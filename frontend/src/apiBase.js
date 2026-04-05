export function getApiBase() {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:3001/api";
  }

  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3001/api`;
}
