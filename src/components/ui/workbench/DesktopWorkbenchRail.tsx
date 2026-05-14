import type { ReactNode } from 'react';
import { MacPanel } from '../MacPanel';

type DesktopWorkbenchRailProps = {
  brand: ReactNode;
  navigation: ReactNode;
  footer: ReactNode;
};

export const DesktopWorkbenchRail = ({
  brand,
  navigation,
  footer,
}: DesktopWorkbenchRailProps) => (
  <MacPanel as="aside" className="desktop-primary-rail mac-sidebar-panel">
    {brand}
    <nav className="desktop-primary-nav" aria-label="Primary workbench navigation">
      {navigation}
    </nav>
    <div className="desktop-primary-foot">{footer}</div>
  </MacPanel>
);
