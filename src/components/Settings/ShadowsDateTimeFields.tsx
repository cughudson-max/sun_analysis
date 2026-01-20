import { Text } from '@fluentui/react-components';
import { DatePicker } from '@fluentui/react-datepicker-compat';
import { TimePicker } from '@fluentui/react-timepicker-compat';
import type { ViewerSettings } from '../../hooks/useSettings';

export default function ShadowsDateTimeFields({
  settings,
  updateSettings
}: {
  settings: ViewerSettings;
  updateSettings: (newSettings: Partial<ViewerSettings>) => void;
}) {
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
                new Date().getFullYear(),
                (settings.month ?? new Date().getMonth() + 1) - 1,
                settings.day ?? new Date().getDate()
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
        <div className="settings-control" style={{ flex: 1, paddingRight: 4 }}>
          <TimePicker
            freeform
            style={{ width: '100%', boxSizing: 'border-box', height: 28, minHeight: 28 }}
            disabled={!settings.shadows}
            placeholder="选择时间"
            value={(() => {
              const base = new Date();
              const currentHour = base.getHours() + base.getMinutes() / 60;
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
              const currentHour = base.getHours() + base.getMinutes() / 60;
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
        </div>
      </div>
    </>
  );
}
