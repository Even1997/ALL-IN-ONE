import type { ParsedStructuredAssistantOutput } from './assistantOutputTypes.ts';

const extractTaggedText = (
  source: string,
  tagName: 'feedback' | 'final',
  allowPartial: boolean,
) => {
  const openTag = `<${tagName}>`;
  const closeTag = `</${tagName}>`;
  const segments: string[] = [];
  let matched = false;
  let cursor = 0;

  while (cursor < source.length) {
    const openIndex = source.indexOf(openTag, cursor);
    if (openIndex === -1) {
      break;
    }

    matched = true;
    const contentStart = openIndex + openTag.length;
    const closeIndex = source.indexOf(closeTag, contentStart);
    if (closeIndex === -1) {
      if (allowPartial) {
        segments.push(source.slice(contentStart));
      }
      break;
    }

    segments.push(source.slice(contentStart, closeIndex));
    cursor = closeIndex + closeTag.length;
  }

  return {
    matched,
    text: segments.map((segment) => segment.trim()).filter(Boolean).join('\n\n').trim(),
  };
};

export const parseStructuredAssistantOutput = (
  source: string,
  options?: { allowPartial?: boolean },
): ParsedStructuredAssistantOutput => {
  const normalizedSource = source.trim();
  if (!normalizedSource) {
    return {
      feedbackText: '',
      finalText: '',
      hasFeedbackTag: false,
      hasFinalTag: false,
      hasStructuredTags: false,
    };
  }

  const allowPartial = options?.allowPartial === true;
  const feedback = extractTaggedText(normalizedSource, 'feedback', allowPartial);
  const final = extractTaggedText(normalizedSource, 'final', allowPartial);
  const hasStructuredTags = feedback.matched || final.matched;

  return {
    feedbackText: feedback.text,
    finalText: hasStructuredTags ? final.text : normalizedSource,
    hasFeedbackTag: feedback.matched,
    hasFinalTag: final.matched,
    hasStructuredTags,
  };
};
