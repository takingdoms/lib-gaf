/*
GENERAL INFO:

ARGB4444 format uses 16 bits per pixel, where each component (alpha, red, green, blue) uses
4 bits each. This means that each component ranges from 0 to 15.
Use the function "convert4bitTo8bit" to scale up each component from 0-15 to 0-255.

ARGB1555 is more tricky. It stores 1 bit for the alpha component, and 5 bits for red, green and
blue components. So alpha ranges from 0-1 and the other colors range from 0-31.
*/

export type ARGBComponents = [number, number, number, number];

/**
 * Each output component retains its 4-bit value ranging from 0 to 15.
 * Use the function "convert4bitTo8bit" to convert each component from 0-15 to 0-255.
 */
export function argb4444ToComponents(pixel: number): ARGBComponents {
  const alpha = (pixel & 0xF000) >> 12;
  const red   = (pixel & 0x0F00) >> 8;
  const green = (pixel & 0x00F0) >> 4;
  const blue  = (pixel & 0x000F) >> 0;

  return [alpha, red, green, blue];
}

/**
 * Converts an ARGB1555 pixel to a (scaled up) 32-bit pixel (8 bit per component).
 * In other words, each component is scaled as follows:
 * alpha: 1-bit  (0-1)  becomes 8-bits (0-255)
 * red:   5-bits (0-31) becomes 8-bits (0-255)
 * green: 5-bits (0-31) becomes 8-bits (0-255)
 * blue:  5-bits (0-31) becomes 8-bits (0-255)
 */
export function argb1555ToScaled8bitComponents(pixel: number): ARGBComponents {
  let alpha = (pixel & 0x8000) >> 15;
  let red   = (pixel & 0x7C00) >> 10;
  let green = (pixel & 0x03E0) >> 5;
  let blue  = (pixel & 0x001F) >> 0;

  alpha = alpha === 0 ? 0 : 255;
  red   = convert5bitTo8bit(red);
  green = convert5bitTo8bit(green);
  blue  = convert5bitTo8bit(blue);

  return [alpha, red, green, blue];
}

export function convert4bitTo8bit(component: number): number {
  return Math.round((component * 255) / 15);
}

export function convert5bitTo8bit(component: number): number {
  return Math.round((component * 255) / 31);
}
