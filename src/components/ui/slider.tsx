import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import * as React from "react";
import { cn } from "@/lib/utils";

interface SliderProps {
  className?: string;
  value?: number[];
  defaultValue?: number[];
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onValueChange?: (
    value: number[],
    details: Parameters<
      NonNullable<React.ComponentProps<typeof SliderPrimitive.Root>["onValueChange"]>
    >[1]
  ) => void;
}

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  (
    { className, value, defaultValue, min = 0, max = 100, step = 1, disabled, onValueChange },
    ref
  ) => {
    const thumbCount = Math.max(value?.length ?? defaultValue?.length ?? 1, 1);

    return (
      <SliderPrimitive.Root
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(next: number | readonly number[], details) => {
          const values = Array.isArray(next) ? [...next] : [next];
          onValueChange?.(values, details);
        }}
        className={cn("relative flex w-full touch-none select-none items-center", className)}
      >
        <SliderPrimitive.Control className="relative h-1.5 w-full grow">
          <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
            <SliderPrimitive.Indicator className="absolute h-full bg-primary" />
          </SliderPrimitive.Track>
          {Array.from({ length: thumbCount }).map((_, index) => (
            <SliderPrimitive.Thumb
              key={`thumb-${index.toString()}`}
              className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            />
          ))}
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>
    );
  }
);
Slider.displayName = "Slider";

export { Slider };
