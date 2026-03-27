'use client';

import React from 'react';

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export default function MessageContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const lines = content.split('\n');

  return (
    <div className={className}>
      {lines.map((line, lineIndex) => {
        const parts = line.split(URL_REGEX);
        return (
          <React.Fragment key={`line-${lineIndex}`}>
            {parts.map((part, index) => {
              if (/^https?:\/\//.test(part)) {
                return (
                  <a
                    key={`part-${lineIndex}-${index}`}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline break-all text-sky-400 hover:text-sky-300"
                  >
                    {part}
                  </a>
                );
              }
              return <React.Fragment key={`part-${lineIndex}-${index}`}>{part}</React.Fragment>;
            })}
            {lineIndex < lines.length - 1 && <br />}
          </React.Fragment>
        );
      })}
    </div>
  );
}
