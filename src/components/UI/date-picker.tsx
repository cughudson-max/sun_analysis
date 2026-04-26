"use client"

import * as React from "react"
import { format } from "date-fns"
import { zhCN } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import { Button } from "@/components/UI/button"
import { Calendar } from "@/components/UI/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/UI/popover"

interface DatePickerProps {
  value?: Date
  onSelectDate?: (date: Date | undefined) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

export function DatePicker({
  value,
  onSelectDate,
  disabled = false,
  placeholder = "选择日期",
}: DatePickerProps) {
  const [date, setDate] = React.useState<Date | undefined>(value)

  React.useEffect(() => {
    setDate(value)
  }, [value])

  const handleSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate)
    onSelectDate?.(selectedDate)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          data-empty={!date}
          disabled={disabled}
          className="w-full h-8 justify-between text-sm text-left font-normal data-[empty=true]:text-muted-foreground"
        >
          {date ? format(date, "yyyy年MM月dd日", { locale: zhCN }) : <span>{placeholder}</span>}
          <CalendarIcon className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          defaultMonth={date}
        />
      </PopoverContent>
    </Popover>
  )
}
