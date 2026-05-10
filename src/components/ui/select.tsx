import { Select as SelectPrimitive } from '@base-ui/react/select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
    React.ComponentRef<typeof SelectPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
    <SelectPrimitive.Trigger
        ref={ref}
        data-slot="select-trigger"
        className={cn(
            'flex h-7 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-none ring-offset-background transition-colors hover:border-primary/50 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:line-clamp-1',
            className,
        )}
        {...props}
    >
        {children}
        <SelectPrimitive.Icon className="shrink-0">
            <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

const SelectScrollUpButton = React.forwardRef<
    React.ComponentRef<typeof SelectPrimitive.ScrollUpArrow>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpArrow>
>(({ className, ...props }, ref) => (
    <SelectPrimitive.ScrollUpArrow
        ref={ref}
        className={cn('flex items-center justify-center py-1 text-muted-foreground', className)}
        {...props}
    >
        <ChevronUp className="h-3.5 w-3.5" />
    </SelectPrimitive.ScrollUpArrow>
));
SelectScrollUpButton.displayName = 'SelectScrollUpButton';

const SelectScrollDownButton = React.forwardRef<
    React.ComponentRef<typeof SelectPrimitive.ScrollDownArrow>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownArrow>
>(({ className, ...props }, ref) => (
    <SelectPrimitive.ScrollDownArrow
        ref={ref}
        className={cn('flex items-center justify-center py-1 text-muted-foreground', className)}
        {...props}
    >
        <ChevronDown className="h-3.5 w-3.5" />
    </SelectPrimitive.ScrollDownArrow>
));
SelectScrollDownButton.displayName = 'SelectScrollDownButton';

interface SelectContentProps extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Popup> {
    children?: React.ReactNode;
    position?: 'popper' | 'item-aligned';
    sideOffset?: number;
}

const SelectContent = React.forwardRef<React.ComponentRef<typeof SelectPrimitive.Popup>, SelectContentProps>(
    ({ className, children, position = 'popper', sideOffset = 4, ...props }, ref) => (
        <SelectPrimitive.Portal>
            <SelectPrimitive.Positioner
                sideOffset={sideOffset}
                alignItemWithTrigger={position === 'item-aligned'}
                className="z-[9999]"
            >
                <SelectPrimitive.Popup
                    ref={ref}
                    data-slot="select-content"
                    className={cn(
                        'isolate max-h-80 min-w-[var(--anchor-width)] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-xl',
                        'data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
                        className,
                    )}
                    {...props}
                >
                    <SelectScrollUpButton />
                    <SelectPrimitive.List className="max-h-80 overflow-y-auto p-1">{children}</SelectPrimitive.List>
                    <SelectScrollDownButton />
                </SelectPrimitive.Popup>
            </SelectPrimitive.Positioner>
        </SelectPrimitive.Portal>
    ),
);
SelectContent.displayName = 'SelectContent';

const SelectLabel = React.forwardRef<
    React.ComponentRef<typeof SelectPrimitive.GroupLabel>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.GroupLabel>
>(({ className, ...props }, ref) => (
    <SelectPrimitive.GroupLabel
        ref={ref}
        className={cn('px-2 py-1 font-semibold text-muted-foreground text-xs', className)}
        {...props}
    />
));
SelectLabel.displayName = 'SelectLabel';

const SelectItem = React.forwardRef<
    React.ComponentRef<typeof SelectPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
    <SelectPrimitive.Item
        ref={ref}
        data-slot="select-item"
        className={cn(
            'relative flex w-full select-none items-center rounded-sm py-1.5 pr-8 pl-2 text-xs outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50',
            className,
        )}
        {...props}
    >
        <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
            <SelectPrimitive.ItemIndicator>
                <Check className="h-3.5 w-3.5 text-primary" />
            </SelectPrimitive.ItemIndicator>
        </span>
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';

const SelectSeparator = React.forwardRef<
    React.ComponentRef<typeof SelectPrimitive.Separator>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
    <SelectPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
));
SelectSeparator.displayName = 'SelectSeparator';

export {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectScrollDownButton,
    SelectScrollUpButton,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
};
