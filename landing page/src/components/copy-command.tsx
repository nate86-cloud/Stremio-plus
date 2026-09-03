import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassButton } from "@/components/glass";

export function CopyCommand({
  command,
  label,
  className,
}: {
  command: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label ? (
        <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {label}
        </p>
      ) : null}
      <div className="glass flex items-center gap-3 rounded-xl border border-border/60 py-2 pr-2 pl-4">
        <code className="font-mono min-w-0 flex-1 truncate text-[13px] text-foreground/90">
          {command}
        </code>
        <GlassButton
          size="sm"
          onClick={copy}
          aria-label={copied ? "Copied" : `Copy command: ${command}`}
          className="shrink-0 px-3"
        >
          {copied ? (
            <Check strokeWidth={1.5} className="size-4 text-accent" />
          ) : (
            <Copy strokeWidth={1.5} className="size-4" />
          )}
          <span className="tabular-nums">{copied ? "Copied" : "Copy"}</span>
        </GlassButton>
      </div>
    </div>
  );
}
