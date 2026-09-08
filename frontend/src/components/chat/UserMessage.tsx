interface UserMessageProps {
  content?: string;
}

export default function UserMessage({ content }: UserMessageProps) {
  return (
    <div className="flex justify-end px-6 py-3">
      <div className="bg-bg-layer2 border border-border-base/50 rounded-xl px-4 py-2.5 text-[13px] leading-relaxed text-text-strong max-w-[82%] whitespace-pre-wrap break-words">
        {content}
      </div>
    </div>
  );
}
