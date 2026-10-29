import { cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../lib/cn";

const avatarVariants = cva("relative flex shrink-0 overflow-hidden rounded-full", {
  variants: {
    size: {
      xs: "h-5 w-5",
      sm: "h-6 w-6",
      md: "h-8 w-8",
      lg: "h-10 w-10",
      xl: "h-12 w-12",
      // The steps between the named sizes have no space token; each adds the 4px step to one.
      "28": "size-[calc(var(--ds-space-300)+var(--ds-space-050))]",
      "36": "size-[calc(var(--ds-space-400)+var(--ds-space-050))]",
      "44": "size-[calc(var(--ds-space-500)+var(--ds-space-050))]"
    }
  },
  defaultVariants: {
    size: "md"
  }
});

type AvatarProps = React.HTMLAttributes<HTMLSpanElement> & {
  className?: string;
  /** `xs` to `xl` are 20, 24, 32, 40, and 48px; 28, 36, and 44 are the steps between, in pixels. */
  size?: "xs" | "sm" | "md" | "lg" | "xl" | 28 | 36 | 44;
};

/** The size as a variant key: the pixel steps are numbers in the props and strings in the variants. */
const sizeKey = (size: AvatarProps["size"]) =>
  size === undefined ? undefined : (`${size}` as const);

const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, size, ...props }, ref) => (
    <span
      data-slot="avatar"
      ref={ref}
      className={cn(avatarVariants({ size: sizeKey(size) }), className)}
      {...props}
    />
  )
);
Avatar.displayName = "Avatar";

interface AvatarImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
}

const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  // An empty alt marks the photo as decorative: the person's name sits beside it.
  ({ alt = "", className, ...props }, ref) => (
    <img
      ref={ref}
      alt={alt}
      className={cn("aspect-square h-full w-full object-cover", className)}
      {...props}
    />
  )
);
AvatarImage.displayName = "AvatarImage";

// Each role tone is a fill and text pair that the theme check measures in every theme and mode.
// A chart tone is ink on a light tint of a chart color, which keeps more than 10:1 on every
// surface; avatar.test.tsx measures it.
const fallbackTones = {
  neutral: "bg-ds-bg-neutral-bold text-ds-text-inverse",
  brand: "bg-ds-bg-brand-bold text-ds-text-brand-inverse",
  information: "bg-ds-bg-information text-ds-text-information",
  success: "bg-ds-bg-success text-ds-text-success",
  warning: "bg-ds-bg-warning text-ds-text-warning",
  danger: "bg-ds-bg-danger text-ds-text-danger",
  discovery: "bg-ds-bg-discovery text-ds-text-discovery",
  "chart-1": "bg-ds-chart-1/20 text-ds-text",
  "chart-2": "bg-ds-chart-2/20 text-ds-text",
  "chart-3": "bg-ds-chart-3/20 text-ds-text",
  "chart-4": "bg-ds-chart-4/20 text-ds-text",
  "chart-5": "bg-ds-chart-5/20 text-ds-text",
  "chart-6": "bg-ds-chart-6/20 text-ds-text"
} as const;

const avatarFallbackVariants = cva(
  "flex h-full w-full items-center justify-center text-body-sm font-medium",
  {
    variants: {
      tone: fallbackTones
    },
    defaultVariants: {
      tone: "neutral"
    }
  }
);

type AvatarFallbackProps = React.HTMLAttributes<HTMLSpanElement> & {
  /**
   * The fill behind the initials: the bold neutral or brand fill, a role tint, or a tint of a chart
   * color for people told apart by category. Defaults to `neutral`.
   */
  tone?: keyof typeof fallbackTones;
};

const AvatarFallback = React.forwardRef<HTMLSpanElement, AvatarFallbackProps>(
  ({ className, tone, ...props }, ref) => (
    <span ref={ref} className={cn(avatarFallbackVariants({ tone }), className)} {...props} />
  )
);
AvatarFallback.displayName = "AvatarFallback";

type AvatarGroupProps = Omit<React.HTMLAttributes<HTMLDivElement>, "aria-label"> & {
  /** The group's accessible name, such as "Assignees". */
  "aria-label": string;
  /** How far each avatar slides over the one before: `md` (default) 8px, `sm` 4px for small avatars. */
  overlap?: "md" | "sm";
  /** The overflow chip's fill, from the `AvatarFallback` tones. Defaults to `neutral`. */
  overflowTone?: AvatarFallbackProps["tone"];
  /** The overflow chip size; match it to the avatars. */
  size?: AvatarProps["size"];
} & (
    | { max?: undefined; overflowLabel?: undefined }
    | {
        /** The most avatars to show; the rest fold into the overflow chip. */
        max: number;
        /** The overflow chip text for the hidden count, such as `(count) => \`+${count}\``. */
        overflowLabel: (count: number) => string;
      }
  );

const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(
  (
    {
      className,
      children,
      max,
      overflowLabel,
      overflowTone = "neutral",
      overlap = "md",
      size,
      ...props
    },
    ref
  ) => {
    const childArray = React.Children.toArray(children);
    const visible = max === undefined ? childArray : childArray.slice(0, max);
    const overflow = childArray.length - visible.length;

    return (
      <div
        ref={ref}
        role="group"
        className={cn(
          "flex *:ring-2 *:ring-ds-surface",
          overlap === "sm" ? "-space-x-ds-050" : "-space-x-ds-100",
          className
        )}
        {...props}
      >
        {visible}
        {overflow > 0 && overflowLabel ? (
          <span
            className={cn(
              avatarVariants({ size: sizeKey(size) }),
              "items-center justify-center text-body-xs font-medium",
              fallbackTones[overflowTone]
            )}
          >
            {overflowLabel(overflow)}
          </span>
        ) : null}
      </div>
    );
  }
);
AvatarGroup.displayName = "AvatarGroup";

export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, avatarVariants };
export type { AvatarProps, AvatarFallbackProps, AvatarGroupProps };
