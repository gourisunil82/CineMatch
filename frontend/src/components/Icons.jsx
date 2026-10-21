/* ============================================================
   CineMatch icon set — hand-written inline SVGs.
   One consistent stroke system (1.75 weight, rounded caps),
   colour inherited from CSS via currentColor. No dependency.
   ============================================================ */

function Svg({ size = 18, strokeWidth = 1.75, filled = false, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconSearch = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </Svg>
);

export const IconClose = (p) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const IconPlus = (p) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconCheck = (p) => (
  <Svg {...p}>
    <path d="m5 13 4.2 4.2L19 7" />
  </Svg>
);

export const IconStar = (p) => (
  <Svg {...p} filled>
    <path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.9l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z" />
  </Svg>
);

export const IconStarOutline = (p) => (
  <Svg {...p}>
    <path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.9l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z" />
  </Svg>
);

export const IconArrowRight = (p) => (
  <Svg {...p}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </Svg>
);

export const IconArrowLeft = (p) => (
  <Svg {...p}>
    <path d="M20 12H5M11 6l-6 6 6 6" />
  </Svg>
);

export const IconMenu = (p) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const IconFilm = (p) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <path d="M7.5 4.5v15M16.5 4.5v15M3 12h18M3 8.2h4.5M3 15.8h4.5M16.5 8.2H21M16.5 15.8H21" />
  </Svg>
);

export const IconBookmark = (p) => (
  <Svg {...p}>
    <path d="M6.5 4.5h11a1 1 0 0 1 1 1v14.2l-6.5-4-6.5 4V5.5a1 1 0 0 1 1-1z" />
  </Svg>
);

export const IconCompass = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m15.4 8.6-2 5.4-5.4 2 2-5.4z" />
  </Svg>
);

export const IconUsers = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="8.5" r="3.4" />
    <path d="M3.5 19.5c.7-3.2 3-4.9 5.5-4.9s4.8 1.7 5.5 4.9" />
    <path d="M15.5 5.6a3.4 3.4 0 0 1 0 5.9M17.6 14.9c1.7.7 2.7 2.3 3 4.6" />
  </Svg>
);

export const IconAlert = (p) => (
  <Svg {...p}>
    <path d="M12 4.4 2.9 19.6h18.2z" />
    <path d="M12 10v4M12 16.8v.2" />
  </Svg>
);

export const IconInfo = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 7.8v.2" />
  </Svg>
);

export const IconSpark = (p) => (
  <Svg {...p}>
    <path d="M12 3.5 13.8 9 19.5 10.8 13.8 12.6 12 18.2 10.2 12.6 4.5 10.8 10.2 9z" />
    <path d="M18.8 16.2l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
  </Svg>
);

export const IconExternal = (p) => (
  <Svg {...p}>
    <path d="M13.5 5H19v5.5M19 5l-7.5 7.5" />
    <path d="M18 13.5V18a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18V7a1.5 1.5 0 0 1 1.5-1.5H10" />
  </Svg>
);
