import { Text, Button } from '@fluentui/react-components';
import { DatePicker } from '@fluentui/react-datepicker-compat';
import { TimePicker } from '@fluentui/react-timepicker-compat';
import { useState, useEffect, useRef } from 'react';
import type { ViewerSettings } from '../../hooks/useSettings';
import playIcon from '../../icon/play.svg';
import pauseIcon from '../../icon/pause.svg';
import playDisabledIcon from '../../icon/play_disabled.svg';
import pauseDisabledIcon from '../../icon/pause_disabled.svg';

function getNowParts(timeZone?: string) {
  const now = new Date();
  if (!timeZone) {
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes()
    };
  }

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = dtf.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  if ([year, month, day, hour, minute].some(n => Number.isNaN(n))) {
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes()
    };
  }
  return { year, month, day, hour, minute };
}

export default function ShadowsDateTimeFields({
  settings,
  updateSettings
}: {
  settings: ViewerSettings;
  updateSettings: (newSettings: Partial<ViewerSettings>) => void;
}) {
  const nowParts = getNowParts(settings.timeZone);
  const currentHour = nowParts.hour + nowParts.minute / 60;

  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = window.setInterval(() => {
        // Accumulate 0.5 hours (30 minutes) every tick
        const step = 0.5;
        const current = settings.hour ?? currentHour;
        let next = current + step;
        if (next >= 24) next = next % 24;
        updateSettings({ hour: next });
      }, 500);
    } else {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, settings.hour, currentHour, updateSettings]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 28, paddingLeft: 8 }}>
        <Text size={200} style={{ minWidth: 64 }}>
          日期
        </Text>
        <div className="settings-control" style={{ flex: 1, paddingRight: 4 }}>
          <DatePicker
            style={{ width: '100%', boxSizing: 'border-box', height: 28, minHeight: 28 }}
            disabled={!settings.shadows}
            value={
              new Date(
                nowParts.year,
                (settings.month ?? nowParts.month) - 1,
                settings.day ?? nowParts.day
              )
            }
            formatDate={(date) => (date ? date.toLocaleDateString('zh-CN') : '')}
            onSelectDate={(date) => {
              if (!date) return;
              updateSettings({
                month: date.getMonth() + 1,
                day: date.getDate()
              });
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 28, paddingLeft: 8 }}>
        <Text size={200} style={{ minWidth: 64 }}>
          时间
        </Text>
        <div className="settings-control" style={{ flex: 1, paddingRight: 4, display: 'flex', gap: 4 }}>
          <TimePicker
            freeform
            style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', height: 28, minHeight: 28 }}
            disabled={!settings.shadows}
            placeholder="选择时间"
            value={(() => {
              const base = new Date();
              const hourValue = settings.hour ?? currentHour;
              const h = Math.floor(hourValue);
              const m = Math.round((hourValue - h) * 60);
              const d = new Date(base);
              d.setHours(h, m, 0, 0);
              const hh = d.getHours().toString().padStart(2, '0');
              const mm = d.getMinutes().toString().padStart(2, '0');
              return `${hh}:${mm}`;
            })()}
            selectedTime={(() => {
              const base = new Date();
              const hourValue = settings.hour ?? currentHour;
              const h = Math.floor(hourValue);
              const m = Math.round((hourValue - h) * 60);
              const d = new Date(base);
              d.setHours(h, m, 0, 0);
              return d;
            })()}
            onTimeChange={(_: any, data: any) => {
              if (!data.selectedTime) return;
              const hours = data.selectedTime.getHours();
              const minutes = data.selectedTime.getMinutes();
              const hourValue = hours + minutes / 60;
              const clamped = Math.max(0, Math.min(23.99, hourValue));
              updateSettings({ hour: clamped });
            }}
          />
          <Button
            appearance="transparent"
            icon={<img src={!settings.shadows ? (isPlaying ? pauseDisabledIcon : playDisabledIcon) : (isPlaying ? pauseIcon : playIcon)} style={{ width: 14, height: 14 }} alt={isPlaying ? "停止" : "开始"} />}
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={!settings.shadows}
            title={isPlaying ? "停止" : "开始"}
            style={{ minWidth: 28, padding: 0 }}
          />
        </div>
      </div>
    </>
  );
}
