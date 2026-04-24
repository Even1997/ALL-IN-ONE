export const chooseNextWorkflowPackage = (availability) => {
    if (!availability.hasRequirementsSpec || !availability.hasFeatureTree) {
        return 'requirements';
    }
    if (!availability.hasPageStructure || !availability.hasWireframes) {
        return 'prototype';
    }
    return 'page';
};
