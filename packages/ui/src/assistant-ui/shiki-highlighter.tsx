"use client";

import type { SyntaxHighlighterProps } from "@assistant-ui/react-markdown";
import type { FC } from "react";

export const SyntaxHighlighter: FC<SyntaxHighlighterProps> = ({
  components: { Pre, Code },
  language,
  code,
}) => {
  return (
    <Pre>
      <Code className={`language-${language}`}>{code}</Code>
    </Pre>
  );
};
