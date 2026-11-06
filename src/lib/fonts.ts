import { Hind_Siliguri, Inter } from "next/font/google";

/**
 * Brand typography.
 *
 * PLACEHOLDER: these are the stand-in faces until the real brand fonts arrive.
 * Changing them here updates the whole site, because the layout only exposes
 * them as the CSS variables consumed by the Tailwind theme in `globals.css`.
 */

/** Latin UI face. */
export const fontLatin = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-latin",
});

/** Bengali face, also carries Latin glyphs so mixed text stays consistent. */
export const fontBengali = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-bengali",
});

export const fontVariables = `${fontLatin.variable} ${fontBengali.variable}`;
