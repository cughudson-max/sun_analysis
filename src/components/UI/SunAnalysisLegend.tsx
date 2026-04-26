import { gradients, getGradientCss } from '@/utils/gradients';

interface SunAnalysisLegendProps {
  maxSunHours: number;
  selectedGradient: string;
}

export function SunAnalysisLegend({ maxSunHours, selectedGradient }: SunAnalysisLegendProps) {
  const gradientCss = getGradientCss(gradients[selectedGradient] || gradients['turbo'], '0deg');

  return (
    <div className="bg-background/90 backdrop-blur-sm rounded-sm p-2 border border-border shadow-lg">
      <div className="flex items-center gap-1">
        <div
          className="w-6 h-[160px]"
          style={{ background: gradientCss }}
        />
        <div className="flex flex-col justify-between h-[160px]">
          <div className="text-xs text-right text-muted-foreground font-medium">
            {maxSunHours.toFixed(1)}
          </div>
          <div className="text-xs text-right text-muted-foreground font-medium">
            0
          </div>
        </div>
      </div>
    </div>
  );
}
