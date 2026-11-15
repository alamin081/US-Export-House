import { barRuns, code128Modules, ean13Modules, isValidEan13 } from "../barcode";

/**
 * A barcode as inline SVG, so it prints sharp at any size with the browser's
 * own print dialog (no printer driver or plug-in). The quiet zone (10 modules
 * each side) is part of the drawing. Server component: no JavaScript ships.
 */
export function BarcodeSvg({
  value,
  kind = "auto",
  heightMm = 12,
  widthMm,
  className,
  testId,
}: {
  value: string;
  /** auto: EAN-13 when the value is a valid EAN-13, otherwise Code 128. */
  kind?: "auto" | "ean13" | "code128";
  heightMm?: number;
  /** Total width; defaults to 0.33 mm per module. */
  widthMm?: number;
  className?: string;
  testId?: string;
}) {
  const ean = kind === "ean13" || (kind === "auto" && isValidEan13(value));
  const modules = ean ? ean13Modules(value) : code128Modules(value);
  const quiet = 10;
  const total = modules.length + quiet * 2;
  const width = widthMm ?? total * 0.33;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${total} 50`}
      width={`${width}mm`}
      height={`${heightMm}mm`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Barcode ${value}`}
      data-barcode={value}
      data-testid={testId}
      className={className}
    >
      <rect x="0" y="0" width={total} height="50" fill="#fff" />
      {barRuns(modules).map(([start, run]) => (
        <rect key={start} x={start + quiet} y="0" width={run} height="50" fill="#000" />
      ))}
    </svg>
  );
}
