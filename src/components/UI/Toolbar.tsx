import { Play, Camera, FolderOpen, Trash2, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/UI/button';
import { Spinner } from '@/components/UI/Spinner';
import { useTranslation } from '@/hooks/useTranslation';

interface ToolbarProps {
  onUploadClick?: () => void;
  onDownloadClick?: () => void;
  onPlayClick?: () => void;
  onDeleteClick?: () => void;
  onTagClick?: () => void;
  isDownloading?: boolean;
  isCalculating?: boolean;
  isTagMode?: boolean;
}

function IconButton({ onClick, icon, title, loading, className }: { onClick?: () => void; icon: React.ReactNode; title?: string; loading?: boolean; className?: string }) {
  return (
    <Button
      onClick={onClick}
      variant="ghost"
      className={cn(
        "w-10 h-10 rounded-md relative text-foreground",
        "cursor-pointer hover:bg-accent",
        className
      )}
      title={title}
      disabled={loading}
    >
      {loading ? <Spinner className="w-5 h-5" /> : icon}
    </Button>
  );
}

export function Toolbar({
  onUploadClick,
  onDownloadClick,
  onPlayClick,
  onDeleteClick,
  onTagClick,
  isDownloading,
  isCalculating,
  isTagMode,
}: ToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-background/95 backdrop-blur-sm rounded-lg py-1 px-2 shadow-lg z-50">
      <IconButton className='w-8 h-8' onClick={onUploadClick} icon={<FolderOpen className="w-5 h-5" />} title={t.topHeader.upload} />
      <IconButton className='w-8 h-8' onClick={onDownloadClick} icon={<Camera className="w-5 h-5" />} title={t.topHeader.download} loading={isDownloading} />
      <IconButton className='w-8 h-8' onClick={onPlayClick} icon={<Play className="w-5 h-5" />} title={t.topHeader.sunAnalysis} loading={isCalculating} />
      <IconButton className={cn('w-8 h-8', isTagMode && 'bg-accent')} onClick={onTagClick} icon={<Tag className="w-5 h-5" />} title="Tag Mode" />
      <IconButton className='w-8 h-8' onClick={onDeleteClick} icon={<Trash2 className="w-5 h-5 text-destructive" />} title={t.topHeader.deleteAnalysis} />
    </div>
  );
}