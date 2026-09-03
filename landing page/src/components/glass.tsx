import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Radius = "sm" | "md" | "lg" | "xl" | "2xl";

const radiusMap: Record<Radius, string> = {
  sm: "rounded-lg",
  md: "rounded-xl",
  lg: "rounded-2xl",
  xl: "rounded-3xl",
  "2xl": "rounded-4xl",
};

export const GlassPanel = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { radius?: Radius }
>(({ className, radius = "xl", ...props }, ref) => (
  <div
    ref={ref}
    className={cn("glass border border-border/60", radiusMap[radius], className)}
    {...props}
  />
));
GlassPanel.displayName = "GlassPanel";

type GlassButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "clear" | "tinted";
  size?: "sm" | "md" | "lg";
};

const sizeMap = {
  sm: "h-9 px-4 text-[13px] rounded-lg gap-2",
  md: "h-11 px-5 text-sm rounded-xl gap-2.5",
  lg: "h-14 px-7 text-[15px] rounded-2xl gap-3",
} as const;

const toneMap = {
  clear: "text-foreground",
  tinted:
    "text-foreground [--glass:color-mix(in_oklab,var(--violet)_26%,transparent)] [--glass-saturate:200%]",
} as const;

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, tone = "clear", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "glass glass-hover inline-flex items-center justify-center border border-border/70 font-medium tracking-[-0.01em] whitespace-nowrap select-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        sizeMap[size],
        toneMap[tone],
        className,
      )}
      {...props}
    />
  ),
);
GlassButton.displayName = "GlassButton";

export const GlassLink = forwardRef<
  HTMLAnchorElement,
  React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    tone?: "clear" | "tinted";
    size?: "sm" | "md" | "lg";
  }
>(({ className, tone = "clear", size = "md", ...props }, ref) => (
  <a
    ref={ref}
    className={cn(
      "glass glass-hover inline-flex items-center justify-center border border-border/70 font-medium tracking-[-0.01em] whitespace-nowrap select-none",
      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      sizeMap[size],
      toneMap[tone],
      className,
    )}
    {...props}
  />
));
GlassLink.displayName = "GlassLink";
