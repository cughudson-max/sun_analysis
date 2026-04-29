import React from 'react';
import { gradients, viewport_gradients, getGradientCss } from '@/utils/gradients';
import { useSunAnalysisSettings, AnalysisPrecision, SunAnalysisSettings } from '@/hooks/useSunAnalysisSettings';
import { useSettings } from '@/hooks/useSettings';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/UI/dialog';
import { Button } from '@/components/UI/button';
import { Calendar } from '@/components/UI/calendar';
import { Separator } from '@/components/UI/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/UI/popover';
import { LocationMapDialog } from '@/components/UI/LocationMapDialog';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  externalSettings?: SunAnalysisSettings;
  onExternalSettingsChange?: (settings: SunAnalysisSettings) => void;
}

function GradientSelect({
  value,
  onValueChange,
  gradients: gradientMap,
  label,
}: {
  value: string;
  onValueChange: (value: string) => void;
  gradients: Record<string, Array<{ offset: number; color: string }>>;
  label: string;
}) {
  const gradientKeys = Object.keys(gradientMap);
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="justify-between flex flex-row items-center">
        <label className="text-sm font-medium">{label}</label>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-[120px] h-8 justify-start gap-2 px-1 flex items-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground cursor-pointer"
          >
            <div
              className="w-full h-6 rounded-sm flex-shrink-0"
              style={{ background: getGradientCss(gradientMap[value]) }}
            />
            <span className="text-sm truncate">{value}</span>
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex w-full flex-col gap-0 max-h-64 overflow-y-auto">
          {gradientKeys.map((name) => (
            <button
              key={name}
              onClick={() => {
                onValueChange(name);
                setOpen(false);
              }}
              className={cn(
                "flex items-center gap-0 px-1 pb-1 rounded-md cursor-pointer transition-colors",
                "hover:bg-accent",
                value === name && "bg-accent"
              )}
            >
              <div
                className="w-full h-6 border rounded-sm flex-shrink-0 border"
                style={{ background: getGradientCss(gradientMap[name]) }}
              />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PrecisionSelect({
  value,
  onValueChange,
}: {
  value: AnalysisPrecision;
  onValueChange: (value: AnalysisPrecision, interval: number) => void;
}) {
  const { t } = useTranslation();
  const options: { value: AnalysisPrecision; label: string; description: string; interval: number }[] = [
    { value: 'low', label: t.settings.precision.low, description: t.settings.precision.lowDesc, interval: 60 },
    { value: 'medium', label: t.settings.precision.medium, description: t.settings.precision.mediumDesc, interval: 30 },
    { value: 'high', label: t.settings.precision.high, description: t.settings.precision.highDesc, interval: 10 },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 p-2">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onValueChange(option.value, option.interval)}
            className={cn(
              "rounded-md p-4 border text-center transition-all",
              value === option.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-muted"
            )}
          >
            <div className="font-bold text-lg">{option.label} </div>
            <div className="text-sm py-1 text-muted-foreground">{t.settings.precision.samplingInterval}: {t.settings.precision.minutes.replace('{count}', option.interval.toString())}</div>
          <div className="text-xs text-muted-foreground/40 mt-1">{option.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ClockPickerField({
  onValueChange,
  label,
}: {
  value: string;
  onValueChange: (date: string, time: string) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);

  const getCurrentDateStr = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const dateValue = getCurrentDateStr();
  const [pendingDate, setPendingDate] = React.useState(dateValue);

  const toLocalDate = (dateStr: string): Date => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const formatDate = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  React.useEffect(() => {
    if (open) {
      setPendingDate(dateValue);
    }
  }, [open, dateValue]);

  const handleSave = () => {
    onValueChange(pendingDate, '10:30:00');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="justify-between flex flex-row items-center">
        <label className="text-sm font-medium whitespace-nowrap">{label}</label>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-[120px] h-8 justify-start gap-2 text-center px-1 flex items-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground cursor-pointer"
          >
            <span className="text-sm text-center w-full">{dateValue}</span>
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-full p-0" align="center">
        <div className="grid grid-space-2 gap-2 p-4">
          <Calendar
            mode="single"
            selected={toLocalDate(pendingDate)}
            onSelect={(date) => {
              if (date) {
                setPendingDate(formatDate(date));
              }
            }}
          />
          <Separator/>
          <div className='flex'>
            <Button className="w-full uppercase" type="submit" onClick={handleSave}>{t.common.save}</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  externalSettings,
  onExternalSettingsChange,
}: SettingsDialogProps) {
  const { settings: internalSettings, updateSettings: updateInternalSettings } = useSunAnalysisSettings();
  const { settings: viewerSettings, updateSettings: updateViewerSettings } = useSettings();
  const { t } = useTranslation();
  const [isLocationDialogOpen, setIsLocationDialogOpen] = React.useState(false);

  const settings = externalSettings ?? internalSettings;
  const updateSettings = onExternalSettingsChange ?? updateInternalSettings;

  const [pendingSettings, setPendingSettings] = React.useState<SunAnalysisSettings | null>(null);
  const currentSettings = pendingSettings ?? settings;

  React.useEffect(() => {
    if (open) {
      setPendingSettings(null);
    }
  }, [open]);

  const handleSave = () => {
    if (pendingSettings) {
      updateSettings(pendingSettings);
      setPendingSettings(null);
    }
    onOpenChange(false);
  };

  const handleCancel = () => {
    setPendingSettings(null);
    onOpenChange(false);
  };

  const handleChange = (partial: Partial<SunAnalysisSettings>) => {
    setPendingSettings(prev => ({
      ...(prev ?? currentSettings),
      ...partial
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="px-4 pb-2">
          <DialogTitle className="uppercase text-base font-bold">{t.settings.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 px-4">
          <section className="space-y-3">
            <PrecisionSelect
              value={currentSettings.precision}
              onValueChange={(v, interval) => handleChange({ precision: v, interval })}
            />
          </section>
          <Separator />
          <section className="space-y-4">
            <div className="flex flex-row items-center justify-between">
              <label className="text-sm font-medium whitespace-nowrap">{t.topHeader.selectLocation}</label>
              <div className="flex flex-row items-center">
                  <span className="text-xs truncate text-muted-foreground italic pl-2 pr-1">
                    {viewerSettings.latitude.toFixed(2)}, {viewerSettings.longitude.toFixed(2)}
                  </span>
                <Button 
                  className="h-8 flex-1 justify-start gap-2 px-4 text-xs ml-4 flex items-center rounded-md border cursor-pointer"
                  onClick={() => setIsLocationDialogOpen(true)}
                >
                  {t.location.title}
                </Button>
              </div>
            </div>
              <ClockPickerField
                value={`${currentSettings.analysisDate}T${currentSettings.analysisTime}`}
                onValueChange={(date, time) => handleChange({ analysisDate: date, analysisTime: time })}
                label={t.settings.analysisTime}
              />
          </section>
          <Separator />
          <section className="space-y-4">
            <GradientSelect
              value={currentSettings.selectedGradient}
              onValueChange={(v) => handleChange({ selectedGradient: v })}
              gradients={gradients}
              label={t.settings.colorMapping}
            />
            <GradientSelect
              value={currentSettings.selectedViewportGradient}
              onValueChange={(v) => handleChange({ selectedViewportGradient: v })}
              gradients={viewport_gradients}
              label={t.settings.viewportBackground}
            />
          </section>
        </div>
        <DialogFooter className="flex rounded-es-md rounded-ee-md justify-end gap-2 py-6 border-t">
          <Button variant="outline" className="h-8 px-4 uppercase" onClick={handleCancel}>
            {t.common.cancel}
          </Button>
          <Button className="h-8 px-4 uppercase" onClick={handleSave}>
            {t.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
      <LocationMapDialog
        open={isLocationDialogOpen}
        onOpenChange={setIsLocationDialogOpen}
        onLocationSelect={(lat, lng) => updateViewerSettings({ latitude: lat, longitude: lng })}
        initialLocation={{ lat: viewerSettings.latitude, lng: viewerSettings.longitude }}
      />
    </Dialog>
  );
}