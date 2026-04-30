import { readFileSync } from 'node:fs';

const aiWorkspaceSource = readFileSync(new URL('../src/components/ai/AIWorkspace.tsx', import.meta.url), 'utf8');
const gnAgentWorkspaceSource = readFileSync(new URL('../src/components/ai/GNAgentWorkspace.tsx', import.meta.url), 'utf8');

const failures = [];

if (!/React\.FC<AIWorkspaceProps>\s*=\s*\(\{\s*collapsed,\s*onCollapsedChange\s*\}\)/m.test(aiWorkspaceSource)) {
  failures.push('AIWorkspace is not accepting collapsed/onCollapsedChange props.');
}

if (!/GNAgentWorkspace\s+collapsed=\{collapsed\}\s+onCollapsedChange=\{onCollapsedChange\}/m.test(aiWorkspaceSource)) {
  failures.push('AIWorkspace is not forwarding collapsed/onCollapsedChange to GNAgentWorkspace.');
}

if (!/import\s+\{\s*AIChat\s*\}\s+from\s+'\.\.\/workspace\/AIChat';/m.test(gnAgentWorkspaceSource)) {
  failures.push('GNAgentWorkspace is not using AIChat.');
}

if (!/AIChat\s+variant="gn-agent-embedded"\s+collapsed=\{collapsed\}\s+onCollapsedChange=\{onCollapsedChange\}/m.test(gnAgentWorkspaceSource)) {
  failures.push('GNAgentWorkspace is not rendering the embedded GN Agent chat shell.');
}

if (failures.length > 0) {
  console.error('AI workspace regression detected:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('AI workspace uses the embedded GN Agent chat shell.');
