import type { ReactNode } from 'react';
import type { Block, Inline } from '@/lib/proposal-markdown';

/**
 * Draws the blocks `parseMarkdown` produces. Every string reaches the page as a
 * React child, so it is escaped on the way out; there is no HTML string anywhere
 * on this path and no `dangerouslySetInnerHTML` (docs/SECURITY.md §6).
 */

function Inlines({ nodes }: { nodes: Inline[] }): ReactNode {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case 'text':
        return node.text;
      case 'code':
        return (
          <code key={index} className="rounded bg-cream px-1 py-0.5 text-[0.85em] text-ink">
            {node.text}
          </code>
        );
      case 'strong':
        return (
          <strong key={index} className="font-extrabold text-ink">
            <Inlines nodes={node.children} />
          </strong>
        );
      case 'link':
        return (
          <a
            key={index}
            href={node.href}
            rel="noopener noreferrer"
            className="font-semibold text-terracotta-deep underline"
          >
            <Inlines nodes={node.children} />
          </a>
        );
    }
  });
}

export function ProposalDocument({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'heading':
            if (block.level === 1) {
              return (
                <h1 key={index} id={block.id} className="text-4xl font-black text-ink">
                  <Inlines nodes={block.content} />
                </h1>
              );
            }
            if (block.level === 2) {
              return (
                <h2
                  key={index}
                  id={block.id}
                  className="scroll-mt-6 border-t border-line pt-8 text-2xl font-extrabold text-ink"
                >
                  <Inlines nodes={block.content} />
                </h2>
              );
            }
            return (
              <h3 key={index} id={block.id} className="text-lg font-extrabold text-ink">
                <Inlines nodes={block.content} />
              </h3>
            );

          case 'paragraph':
            return (
              <p key={index} className="leading-relaxed text-ink-soft">
                <Inlines nodes={block.content} />
              </p>
            );

          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul';
            const task = block.items.some((item) => item.checked !== null);
            return (
              <Tag
                key={index}
                className={`space-y-2 leading-relaxed text-ink-soft ${
                  task ? 'list-none pl-0' : block.ordered ? 'list-decimal pl-6' : 'list-disc pl-6'
                }`}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className={task ? 'flex gap-2' : undefined}>
                    {item.checked !== null && (
                      <span aria-label={item.checked ? 'Done' : 'Open'} className="shrink-0">
                        {item.checked ? '☑' : '☐'}
                      </span>
                    )}
                    <span>
                      <Inlines nodes={item.content} />
                    </span>
                  </li>
                ))}
              </Tag>
            );
          }

          case 'table':
            return (
              <div key={index} className="overflow-x-auto rounded-xl border border-line bg-card">
                <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                  <thead className="bg-cream text-ink">
                    <tr>
                      {block.header.map((cell, cellIndex) => (
                        <th key={cellIndex} scope="col" className="px-3 py-2 font-extrabold">
                          <Inlines nodes={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-ink-soft">
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t border-line align-top">
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="px-3 py-2">
                            <Inlines nodes={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
