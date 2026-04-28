import type { ReactNode, SVGProps } from 'react';

export type WorkbenchIconName =
  | 'product'
  | 'design'
  | 'search'
  | 'sun'
  | 'moon'
  | 'knowledge'
  | 'page'
  | 'spark'
  | 'plus'
  | 'trash'
  | 'chevronRight'
  | 'files'
  | 'terminal'
  | 'folder'
  | 'gitBranch'
  | 'bug'
  | 'puzzle'
  | 'settings'
  | 'document'
  | 'panelRightOpen'
  | 'panelRightClose';

type WorkbenchIconProps = SVGProps<SVGSVGElement> & {
  name: WorkbenchIconName;
};

const ICON_PATHS: Record<WorkbenchIconName, ReactNode> = {
  product: (
    <>
      <rect x="3.5" y="4.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="4.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
      <path d="M15 14.5h4.5m-2.25-2.25v4.5" />
    </>
  ),
  design: (
    <>
      <path d="M4 19.5h4.25l9.5-9.5a2.12 2.12 0 1 0-3-3l-9.5 9.5V19.5Z" />
      <path d="m13.5 8.5 3 3" />
      <path d="M4 19.5h5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="5.5" />
      <path d="m16 16 3.5 3.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.25M12 19.25v2.25M21.5 12h-2.25M4.75 12H2.5M18.72 5.28l-1.6 1.6M6.88 17.12l-1.6 1.6M18.72 18.72l-1.6-1.6M6.88 6.88l-1.6-1.6" />
    </>
  ),
  moon: (
    <>
      <path d="M20 14.2A7.8 7.8 0 1 1 9.8 4a6.4 6.4 0 1 0 10.2 10.2Z" />
    </>
  ),
  knowledge: (
    <>
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v17H7.5A2.5 2.5 0 0 0 5 22V5.5Z" />
      <path d="M5 19.5A2.5 2.5 0 0 1 7.5 17H19" />
    </>
  ),
  page: (
    <>
      <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5Z" />
      <path d="M14 3.5V8h4.5" />
      <path d="M9 12h6M9 16h4" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" />
      <path d="M19 15.5 19.8 18l2.5.8-2.5.8-.8 2.4-.8-2.4-2.5-.8 2.5-.8.8-2.5Z" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15" />
      <path d="M9.5 3.5h5l.75 2.5h-6.5l.75-2.5Z" />
      <path d="M7 6.5V19a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 17 19V6.5" />
      <path d="M10 10v6M14 10v6" />
    </>
  ),
  chevronRight: (
    <>
      <path d="m9 6 6 6-6 6" />
    </>
  ),
  files: (
    <>
      <path d="M9 4.5h9a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 18 17.5H9A1.5 1.5 0 0 1 7.5 16V6A1.5 1.5 0 0 1 9 4.5Z" />
      <path d="M4.5 8.5V18A1.5 1.5 0 0 0 6 19.5h9.5" />
    </>
  ),
  terminal: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="m7.5 10 2.5 2-2.5 2M12.5 15H16" />
    </>
  ),
  folder: (
    <>
      <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3l1.5 2H18A2.5 2.5 0 0 1 20.5 9.5v7A2.5 2.5 0 0 1 18 19H6A2.5 2.5 0 0 1 3.5 16.5v-9Z" />
    </>
  ),
  gitBranch: (
    <>
      <circle cx="7" cy="6" r="2" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="17" cy="6" r="2" />
      <path d="M9 6h6M7 8v6a4 4 0 0 0 4 4h4" />
    </>
  ),
  bug: (
    <>
      <path d="M9 9.5a3 3 0 1 1 6 0v5a3 3 0 1 1-6 0v-5Z" />
      <path d="M12 6V3.5M7 10H4.5M19.5 10H17M7 14H4.5M19.5 14H17M8 6.5 6.5 5M16 6.5 17.5 5" />
    </>
  ),
  puzzle: (
    <>
      <path d="M9 4.5h3a2.5 2.5 0 1 1 5 0h2.5V10a2.5 2.5 0 1 1 0 5v4.5H14a2.5 2.5 0 1 1-5 0H4.5V14a2.5 2.5 0 1 1 0-5V4.5H9Z" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.25M12 18.25v2.25M20.5 12h-2.25M5.75 12H3.5M18.01 5.99l-1.6 1.6M7.59 16.41l-1.6 1.6M18.01 18.01l-1.6-1.6M7.59 7.59l-1.6-1.6" />
    </>
  ),
  document: (
    <>
      <path d="M8 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 7 20V5A1.5 1.5 0 0 1 8.5 3.5Z" />
      <path d="M15 3.5V8h4" />
    </>
  ),
  panelRightOpen: (
    <>
      <rect x="4" y="4.5" width="16" height="15" rx="2" />
      <path d="M15.5 4.5v15" />
      <path d="m12.5 8.25-3.5 3.75 3.5 3.75" />
    </>
  ),
  panelRightClose: (
    <>
      <rect x="4" y="4.5" width="16" height="15" rx="2" />
      <path d="M15.5 4.5v15" />
      <path d="m9.5 8.25 3.5 3.75-3.5 3.75" />
    </>
  ),
};

export const WorkbenchIcon = ({ name, ...props }: WorkbenchIconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {ICON_PATHS[name]}
  </svg>
);
