export function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
