/**
 * The mark: two circles that overlap. Same drawing as app/icon.svg, in the current accent colour
 * so it follows light, dark and high-contrast modes.
 */
export function Mark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false" className={className}>
      <circle cx="25" cy="32" r="17" fill="currentColor" fillOpacity="0.55" />
      <circle cx="39" cy="32" r="17" fill="currentColor" fillOpacity="0.55" />
    </svg>
  );
}
