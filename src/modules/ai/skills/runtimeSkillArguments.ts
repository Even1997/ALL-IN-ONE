const parseArguments = (value: string) => {
  const matches = value.match(/"[^"]*"|'[^']*'|`[^`]*`|\S+/g) || [];
  return matches.map((item) => item.replace(/^['"]|['"]$/g, ''));
};

export const substituteRuntimeSkillArguments = (
  content: string,
  rawArguments: string,
  argumentNames: string[] = [],
  appendIfNoPlaceholder = false
) => {
  const parsedArguments = parseArguments(rawArguments);
  const originalContent = content;
  let nextContent = content;

  argumentNames.forEach((name, index) => {
    nextContent = nextContent.replace(
      new RegExp(`\\$${name}(?![\\[\\w])`, 'g'),
      parsedArguments[index] || ''
    );
  });

  nextContent = nextContent.replace(/\$ARGUMENTS\[(\d+)\]/g, (_, index) => parsedArguments[Number(index)] || '');
  nextContent = nextContent.replace(/\$(\d+)(?!\w)/g, (_, index) => parsedArguments[Number(index)] || '');
  nextContent = nextContent.replace(/\$ARGUMENTS/g, rawArguments);

  if (nextContent === originalContent && appendIfNoPlaceholder && rawArguments.trim()) {
    nextContent = `${nextContent}\n\nARGUMENTS: ${rawArguments}`;
  }

  return nextContent;
};

export const buildRuntimeSkillArgumentStatus = (input: {
  rawArguments: string;
  argumentHint?: string;
  argumentNames?: string[];
}) => {
  const argumentNames = input.argumentNames || [];
  const parsedArguments = parseArguments(input.rawArguments);
  const missingArgumentNames = argumentNames.slice(parsedArguments.length);

  return {
    parsedArguments,
    missingArgumentNames,
    argumentHint:
      missingArgumentNames.length > 0
        ? input.argumentHint || missingArgumentNames.map((name) => `<${name}>`).join(' ')
        : input.argumentHint || '',
  };
};
