import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

const ALLOWED_ELEMENTS = [
  "p",
  "br",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "code",
  "pre",
];

interface MarkdownContentProps {
  children: string;
  className?: string;
}

export function MarkdownContent({ children, className }: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        allowedElements={ALLOWED_ELEMENTS}
        remarkPlugins={[remarkBreaks]}
        skipHtml
        unwrapDisallowed
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
