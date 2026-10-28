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
      xl: "h-12 w-12"
    }
  },
  defaultVariants: {
    size: "md"
  }
});

type AvatarProps = React.HTMLAttributes<HTMLSpanElement> & {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
};

const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, size, ...props }, ref) => (
    <span
      data-slot="avatar"
      ref={ref}
      className={cn(avatarVariants({ size }), className)}
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

// Each tone is a fill and text pair that the theme check measures in every theme and mode.
const avatarFallbackVariants = cva(
  "flex h-full w-full items-center justify-center text-body-sm font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-ds-bg-neutral-bold text-ds-text-inverse",
        brand: "bg-ds-bg-brand-bold text-ds-text-brand-inverse",
        information: "bg-ds-bg-information text-ds-text-information",
        success: "bg-ds-bg-success text-ds-text-success",
        warning: "bg-ds-bg-warning text-ds-text-warning",
        danger: "bg-ds-bg-danger text-ds-text-danger",
        discovery: "bg-ds-bg-discovery text-ds-text-discovery"
      }
    },
    defaultVariants: {
      tone: "neutral"
    }
  }
);

type AvatarFallbackProps = React.HTMLAttributes<HTMLSpanElement> & {
  /** The fill behind the initials: the bold neutral or brand fill, or a role tint. Defaults to `neutral`. */
  tone?: "brand" | "danger" | "discovery" | "information" | "neutral" | "success" | "warning";
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
  ({ className, children, max, overflowLabel, size, ...props }, ref) => {
    const childArray = React.Children.toArray(children);
    const visible = max === undefined ? childArray : childArray.slice(0, max);
    const overflow = childArray.length - visible.length;

    return (
      <div
        ref={ref}
        role="group"
        className={cn("flex -space-x-ds-100 *:ring-2 *:ring-ds-surface", className)}
        {...props}
      >
        {visible}
        {overflow > 0 && overflowLabel ? (
          <span
            className={cn(
              avatarVariants({ size }),
              "items-center justify-center bg-ds-bg-neutral-bold text-body-xs font-medium text-ds-text-inverse"
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
