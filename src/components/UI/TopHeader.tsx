import React, { useState } from 'react';
import { Settings, Moon, Sun, Globe, Check, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/UI/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/UI/popover';
import { useTranslation } from '@/hooks/useTranslation';
import { languages, Language } from '@/i18n/translations';
import { AppName } from '@/config';

function LanguageSwitcher({ currentLanguage, onLanguageChange }: { currentLanguage: Language; onLanguageChange: (lang: Language) => void }) {
  const [open, setOpen] = useState(false);
  const currentLang = languages.find(l => l.value === currentLanguage) || languages[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("h-8 px-2 gap-2 text-foreground cursor-pointer inline-flex items-center justify-center rounded-md hover:bg-muted transition-colors border-0 bg-transparent")}
        >
          <Globe className="w-4 h-4" />
          <span className="text-xs">{currentLang.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-1 z-[100]" align="start">
        <div className="flex flex-col gap-0">
          {languages.map((lang) => (
            <button
              key={lang.value}
              type="button"
              onClick={() => {
                onLanguageChange(lang.value);
                setOpen(false);
              }}
              className={cn(
                "flex items-center justify-between gap-8 px-3 py-2 rounded-sm cursor-pointer transition-colors text-xs",
                "hover:bg-accent",
                currentLanguage === lang.value && "bg-accent"
              )}
            >
              <span>{lang.label}</span>
              {currentLanguage === lang.value && <Check className="w-4 h-4" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function IconButton({ onClick, icon, title }: { onClick?: () => void; icon: React.ReactNode; title?: string }) {
  return (
    <Button
      onClick={onClick}
      variant="ghost"
      className={cn(
        "w-8 h-8 rounded-sm relative text-foreground",
        "cursor-pointer"
      )}
      title={title}
    >
      {icon}
    </Button>
  );
}

interface TopHeaderProps {
  onSettingClick?: () => void;
  onEmailClick?: () => void;
  onThemeToggle?: () => void;
  onLanguageChange?: (lang: Language) => void;
  isDarkMode?: boolean;
  currentLanguage?: Language;
}

export function TopHeader({
  onSettingClick,
  onEmailClick,
  onThemeToggle,
  onLanguageChange,
  isDarkMode,
  currentLanguage = 'zh-CN',
}: TopHeaderProps) {
  const { t } = useTranslation();

  const handleEmailClick = () => {
    if (onEmailClick) {
      onEmailClick();
    } else {
      window.location.href = 'mailto:cughudson@126.com';
    }
  };

  return (
    <div className="fixed drop-shadow-sm top-0 left-0 w-full bg-background h-12 flex justify-between px-4 z-50 items-center">
      <div className="flex items-center gap-3">
        <img src="./icon.svg" className="w-6 h-6" alt="logo" />
        <span className="text-lg font-semibold text-foreground">{AppName}</span>
      </div>
      <div className="flex items-center gap-0">
        <LanguageSwitcher currentLanguage={currentLanguage} onLanguageChange={onLanguageChange || (() => {})} />
        <IconButton onClick={onThemeToggle} icon={isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />} title={isDarkMode ? t.topHeader.lightMode : t.topHeader.darkMode} />
        <IconButton onClick={handleEmailClick} icon={<Mail className="w-4 h-4" />} title={t.topHeader.email} />
        <IconButton onClick={onSettingClick} icon={<Settings className="w-4 h-4" />} title={t.topHeader.settings} />
      </div>
    </div>
  );
}