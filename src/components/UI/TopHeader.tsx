import React, { useState } from 'react';
import { Settings, Play, Camera, FolderOpen, Moon, Sun, Globe, Check, Mail, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/UI/button';
import { Spinner } from '@/components/UI/Spinner';
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


interface TopHeaderProps {
  onSettingClick?: () => void;
  onUploadClick?: () => void;
  onDownloadClick?: () => void;
  onPlayClick?: () => void;
  onEmailClick?: () => void;
  onThemeToggle?: () => void;
  onLanguageChange?: (lang: Language) => void;
  onDeleteClick?: () => void;
  isDownloading?: boolean;
  isPlaying?: boolean;
  isCalculating?: boolean;
  isDarkMode?: boolean;
  currentLanguage?: Language;
}

function IconButton({ onClick, icon, title, loading }: { onClick?: () => void; icon: React.ReactNode; title?: string; loading?: boolean }) {
  return (
    <Button
      onClick={onClick}
      variant="ghost"
      className={cn(
        "w-8 h-8 rounded-sm relative text-foreground",
        "cursor-pointer"
      )}
      title={title}
      disabled={loading}
    >
      {loading ? <Spinner className="w-4 h-4" /> : icon}
    </Button>
  );
}



export function TopHeader({
  onSettingClick,
  onUploadClick,
  onDownloadClick,
  onPlayClick,
  onEmailClick,
  onThemeToggle,
  onLanguageChange,
  onDeleteClick,
  isDownloading,
  isPlaying: _isPlaying,
  isCalculating,
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
      <div className="flex items-center gap-1">
        <IconButton onClick={onUploadClick} icon={<FolderOpen className="w-4 h-4" />} title={t.topHeader.upload} />
        <IconButton onClick={onDownloadClick} icon={<Camera className="w-4 h-4" />} title={t.topHeader.download} loading={isDownloading} />
        <IconButton onClick={onPlayClick} icon={<Play className="w-4 h-4" />} title={t.topHeader.sunAnalysis} loading={isCalculating} />
        <IconButton onClick={onDeleteClick} icon={<Trash2 className="w-4 h-4 text-destructive" />} title={t.topHeader.deleteAnalysis} />
      </div>
      <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-2 text-lg font-semibold text-foreground">
        <img src="/src/favcion.png" className="w-6 h-6" alt="logo" />
        <span>{AppName}</span>
      </div>
      <div className="flex items-center gap-1">
        <LanguageSwitcher currentLanguage={currentLanguage} onLanguageChange={onLanguageChange || (() => {})} />
        <IconButton onClick={onThemeToggle} icon={isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />} title={isDarkMode ? t.topHeader.lightMode : t.topHeader.darkMode} />
        <IconButton onClick={handleEmailClick} icon={<Mail className="w-4 h-4" />} title={t.topHeader.email} />
        <IconButton onClick={onSettingClick} icon={<Settings className="w-4 h-4" />} title={t.topHeader.settings} />
      </div>
    </div>
  );
}