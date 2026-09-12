import { cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../lib/cn";

const avatarVariants = cva(
  "relative flex shrink-0 overflow-hidden rounded-[var(--ds-radius-round)]",
  {
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
  }
);

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
  ({ className, ...props }, ref) => (
    <img
      ref={ref}
      className={cn("aspect-square h-full w-full object-cover", className)}
      {...props}
    />
  )
);
AvatarImage.displayName = "AvatarImage";

const AvatarFallback = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "flex h-full w-full items-center justify-center bg-[var(--ds-background-neutral-bold)] text-[color:var(--ds-text-inverse)] text-body-sm font-medium",
        className
      )}
      {...props}
    />
  )
);
AvatarFallback.displayName = "AvatarFallback";

interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  max?: number;
}

const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(
  ({ className, children, max, ...props }, ref) => {
    const childArray = React.Children.toArray(children);
    const visible = max ? childArray.slice(0, max) : childArray;
    const overflow = max ? childArray.length - max : 0;

    return (
      <div ref={ref} className={cn("flex -space-x-2", className)} {...props}>
        {visible}
        {overflow > 0 && (
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--ds-radius-round)] border-2 border-[var(--ds-surface)] bg-[var(--ds-background-neutral-bold)] text-[color:var(--ds-text-inverse)] text-body-sm font-medium">
            +{overflow}
          </span>
        )}
      </div>
    );
  }
);
AvatarGroup.displayName = "AvatarGroup";

export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, avatarVariants };
export type { AvatarProps, AvatarGroupProps };
