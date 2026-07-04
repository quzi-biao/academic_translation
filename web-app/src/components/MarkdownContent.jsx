import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { KATEX_MACROS } from '../math';

export default function MarkdownContent({ content }) {
  return <div className="markdown-content">
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { macros: KATEX_MACROS, strict: 'ignore', trust: true, throwOnError: false }]]}
      components={{
        code({ inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          return !inline && match ? (
            <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" className="code-block" {...props}>
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code className="inline-code" {...props}>{children}</code>
          );
        },
        img({ src, alt }) {
          return <figure className="md-figure"><img src={src} alt={alt || ''} /><figcaption>{alt || '图片'}</figcaption></figure>;
        },
        table({ children }) {
          return <div className="table-wrap"><table>{children}</table></div>;
        },
        a({ href, children }) {
          return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
        },
      }}
    >
      {content || ''}
    </ReactMarkdown>
  </div>;
}
