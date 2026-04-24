import type { AIWorkflowPackage } from '../../../types';

export type WorkflowArtifactAvailability = {
  hasRequirementsSpec: boolean;
  hasFeatureTree: boolean;
  hasPageStructure: boolean;
  hasWireframes: boolean;
};

export const chooseNextWorkflowPackage = (
  availability: WorkflowArtifactAvailability
): AIWorkflowPackage => {
  if (!availability.hasRequirementsSpec || !availability.hasFeatureTree) {
    return 'requirements';
  }

  if (!availability.hasPageStructure || !availability.hasWireframes) {
    return 'prototype';
  }

  return 'page';
};
