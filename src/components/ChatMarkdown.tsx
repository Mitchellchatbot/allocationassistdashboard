// Lazily-loaded markdown renderer for the AI panel.
//
// react-markdown pulls in the entire micromark / mdast / unified pipeline
// (~400 kB of source). It used to be a STATIC import in ai-panel-context, so
// that whole stack shipped in the main every-page bundle even though markdown
// only ever renders inside the AI chat panel (which most page loads never
// open). Isolating it here lets ai-panel-context load it with React.lazy, so
// the parser downloads on first panel open instead of on every page load.
//
// `plain` = the streaming variant: no custom component map, inherits the
// surrounding `.prose` styles. Otherwise the full chat-bubble component map.

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const FULL_COMPONENTS: Components = {
  p:      ({ children }) => <p className="text-[13px] text-foreground leading-relaxed mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em:     ({ children }) => <em className="italic text-foreground/80">{children}</em>,
  h1:     ({ children }) => <h1 className="text-[15px] font-bold text-foreground mt-3 mb-1.5 first:mt-0">{children}</h1>,
  h2:     ({ children }) => <h2 className="text-[14px] font-semibold text-foreground mt-3 mb-1 first:mt-0">{children}</h2>,
  h3:     ({ children }) => <h3 className="text-[13px] font-semibold text-foreground/90 mt-2 mb-1 first:mt-0">{children}</h3>,
  ul:     ({ children }) => <ul className="my-2 space-y-1 pl-1">{children}</ul>,
  ol:     ({ children }) => <ol className="my-2 space-y-1 pl-1 list-none counter-reset-[item]">{children}</ol>,
  li:     ({ children, ...props }) => {
    const isOrdered = (props as { ordered?: boolean }).ordered;
    return (
      <li className="flex items-start gap-2 text-[13px] text-foreground leading-relaxed">
        {isOrdered
          ? <span className="shrink-0 mt-0.5 h-4 w-4 rounded-full bg-primary/10 text-[9px] font-bold text-primary flex items-center justify-center">•</span>
          : <span className="shrink-0 mt-[7px] h-1.5 w-1.5 rounded-full bg-primary/60" />}
        <span>{children}</span>
      </li>
    );
  },
  code:   ({ children, className }) => {
    const isBlock = className?.includes("language-");
    return isBlock
      ? <code className="block bg-muted rounded-lg px-3 py-2 text-[12px] font-mono text-foreground my-2 overflow-x-auto">{children}</code>
      : <code className="bg-muted rounded px-1.5 py-0.5 text-[11px] font-mono text-primary">{children}</code>;
  },
  table:   ({ children }) => <div className="overflow-x-auto my-2"><table className="w-full border-collapse text-[11px]">{children}</table></div>,
  thead:   ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  tbody:   ({ children }) => <tbody>{children}</tbody>,
  tr:      ({ children }) => <tr className="border-b border-border/40 last:border-0">{children}</tr>,
  th:      ({ children }) => <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{children}</th>,
  td:      ({ children }) => <td className="px-2 py-1.5 text-[11px] text-foreground">{children}</td>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/40 pl-3 italic text-foreground/70 my-2">{children}</blockquote>,
  hr: () => <hr className="border-border/40 my-3" />,
};

export default function ChatMarkdown({ content, plain }: { content: string; plain?: boolean }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={plain ? undefined : FULL_COMPONENTS}>
      {content}
    </ReactMarkdown>
  );
}
