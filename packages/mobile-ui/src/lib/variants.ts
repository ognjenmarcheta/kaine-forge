import { cva } from "class-variance-authority";

export const buttonVariants = cva("min-h-10 flex-row items-center justify-center rounded-md", {
  variants: {
    appearance: {
      default: "bg-ds-bg-brand-bold active:bg-ds-bg-brand-bold-pressed",
      secondary: "bg-ds-bg-neutral active:bg-ds-bg-neutral-pressed",
      subtle: "bg-transparent active:bg-ds-bg-neutral-subtle-pressed",
      ghost: "bg-transparent active:bg-ds-bg-neutral-subtle-pressed",
      danger: "bg-ds-bg-danger-bold active:bg-ds-bg-danger-bold-pressed",
      warning: "bg-ds-bg-warning-bold active:bg-ds-bg-warning-bold-pressed"
    },
    spacing: {
      compact: "px-3 py-1.5",
      default: "px-4 py-2.5",
      spacious: "px-5 py-3.5"
    }
  },
  defaultVariants: {
    appearance: "default",
    spacing: "default"
  }
});

export const buttonTextVariants = cva("font-medium", {
  variants: {
    appearance: {
      default: "text-ds-text-inverse",
      secondary: "text-ds-text",
      subtle: "text-ds-text",
      ghost: "text-ds-text",
      danger: "text-ds-text-inverse",
      warning: "text-ds-text-warning-inverse"
    },
    spacing: {
      compact: "text-sm",
      default: "text-base",
      spacious: "text-lg"
    }
  },
  defaultVariants: {
    appearance: "default",
    spacing: "default"
  }
});

export const textVariants = cva("", {
  variants: {
    variant: {
      heading: "text-2xl font-semibold text-ds-text",
      subheading: "text-xl font-semibold text-ds-text",
      body: "text-base text-ds-text",
      caption: "text-sm text-ds-text-subtle",
      label: "text-sm font-medium text-ds-text-subtlest"
    }
  },
  defaultVariants: {
    variant: "body"
  }
});
