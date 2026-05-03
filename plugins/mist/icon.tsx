export function MistIcon({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      fill="none"
      height="148"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.25"
      style={style}
      viewBox="0 0 24 24"
      width="148"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>MIST</title>
      <path d="M3 7h18" />
      <path d="M3 12h18" />
      <path d="M3 17h18" />
      <circle cx="8" cy="7" r="1.5" fill="currentColor" />
      <circle cx="16" cy="12" r="1.5" fill="currentColor" />
      <circle cx="11" cy="17" r="1.5" fill="currentColor" />
    </svg>
  );
}
