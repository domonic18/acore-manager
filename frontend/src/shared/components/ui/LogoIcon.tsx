interface LogoIconProps {
  className?: string;
}

export function LogoIcon({ className }: LogoIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="mgrSilver" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#d1d5db" />
          <stop offset="50%" stopColor="#9ca3af" />
          <stop offset="100%" stopColor="#4b5563" />
        </linearGradient>
        <linearGradient id="mgrPurple" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="50%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#4c1d95" />
        </linearGradient>
        <linearGradient id="mgrGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>

      <path
        d="M16 3l10 4v9c0 6-4.5 11.5-10 13-5.5-1.5-10-7-10-13V7l10-4z"
        fill="#1f2937"
        stroke="url(#mgrSilver)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M16 6l7 2.8v6.5c0 4.5-3.2 8.8-7 10-3.8-1.2-7-5.5-7-10V8.8L16 6z"
        fill="none"
        stroke="url(#mgrPurple)"
        strokeWidth="1"
        opacity="0.7"
      />
      <path
        d="M11 11h10l-1.5 7.5h-7L11 11z"
        fill="url(#mgrPurple)"
        stroke="url(#mgrSilver)"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <circle cx="13.2" cy="14.5" r="1.4" fill="#22d3ee" />
      <circle cx="18.8" cy="14.5" r="1.4" fill="#22d3ee" />
      <path
        d="M8 11c1.8 0.8 3 2.5 3 4.5M24 11c-1.8 0.8-3 2.5-3 4.5"
        fill="none"
        stroke="url(#mgrSilver)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path d="M16 21l1.5 1.5-1.5 1.5-1.5-1.5 1.5-1.5z" fill="url(#mgrGlow)" />
    </svg>
  );
}
