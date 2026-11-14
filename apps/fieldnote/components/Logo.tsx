export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="fn-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6b8dff" />
          <stop offset="1" stopColor="#2547c4" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#fn-grad)" />
      <path d="M12 10h12.5a3.5 3.5 0 0 1 3.5 3.5V30H15.5A3.5 3.5 0 0 1 12 26.5V10z" fill="#fff" />
      <path d="M12 10h3v20.5a3.5 3.5 0 0 1-3-3.5z" fill="#c9d6ff" />
      <path d="M18.5 15.5h6.5M18.5 19.5h6.5" stroke="#2f5bea" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18.5 24c2.2-4.2 5.4-5.4 8.8-4.8-.6 3.6-3.6 5.8-8.8 4.8z" fill="#3ec16b" />
    </svg>
  );
}
