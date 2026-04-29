import { gradients, getGradientCss } from '@/utils/gradients';

interface SunAnalysisLegendProps {
  maxSunHours: number;
  selectedGradient: string;
}

export function SunAnalysisLegend({ maxSunHours, selectedGradient }: SunAnalysisLegendProps) {
  const gradientCss = getGradientCss(gradients[selectedGradient] || gradients['turbo'], '0deg');

  return (
    <div className="bg-transparent">
      <div className="flex items-center gap-1">
        <div
          className="w-6 h-[160px] rounded-sm"
          style={{ background: gradientCss }}
        />
        <div className="flex flex-col justify-between h-[160px]">
          <div className="text-xs text-right font-medium">
            {maxSunHours.toFixed(1)}
          </div>
          <div className="text-xs text-right font-medium">
            0
          </div>
        </div>
      </div>
    </div>
  );
}
