"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const inputGroupVariants = cva(
  "group/input-group flex w-full items-center rounded-md border border-input bg-background text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
  {
    variants: {
      size: {
        default: "h-10",
        sm: "h-8",
        lg: "h-12",
        xs: "h-7",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

interface InputGroupProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof inputGroupVariants> {}

const InputGroup = React.forwardRef<HTMLDivElement, InputGroupProps>(
  ({ className, size, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="input-group"
        className={cn(inputGroupVariants({ size, className }))}
        {...props}
      />
    )
  }
)
InputGroup.displayName = "InputGroup"

const InputGroupInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { disabled?: boolean }
>(({ className, disabled, ...props }, ref) => {
  return (
    <input
      ref={ref}
      data-slot="input-group-input"
      disabled={disabled}
      className={cn(
        "flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
})
InputGroupInput.displayName = "InputGroupInput"

interface InputGroupAddonProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "inline-start" | "inline-end"
}

const InputGroupAddon = React.forwardRef<HTMLDivElement, InputGroupAddonProps>(
  ({ className, align = "inline-start", ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="input-group-addon"
        data-align={align}
        className={cn(
          "flex items-center justify-center px-2 text-muted-foreground",
          align === "inline-end" && "order-last",
          className
        )}
        {...props}
      />
    )
  }
)
InputGroupAddon.displayName = "InputGroupAddon"

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-sm text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 px-2",
        lg: "h-10 px-4",
        icon: "h-8 w-8",
        "icon-xs": "h-5 w-5",
        "icon-sm": "h-6 w-6",
        "icon-lg": "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

interface InputGroupButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const InputGroupButton = React.forwardRef<HTMLButtonElement, InputGroupButtonProps>(
  ({ className, variant = "ghost", size = "icon", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : "button"
    return (
      <Comp
        ref={ref}
        data-slot="input-group-button"
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    )
  }
)
InputGroupButton.displayName = "InputGroupButton"

export {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
}
