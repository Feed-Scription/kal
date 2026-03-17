import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Link, Upload, Trash2, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getExternalLocales,
  loadLocaleFromFile,
  loadLocaleFromUrl,
  removeExternalLocale,
  type ExternalLocaleMeta,
} from '@/i18n/loader';
import i18n from '@/i18n';

const BUILT_IN_LANGUAGES = [
  { lang: 'en', label: 'English' },
  { lang: 'zh-CN', label: '中文' },
] as const;

export function LanguageSwitcher() {
  const { t } = useTranslation('workbench');
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [externalLocales, setExternalLocales] = useState<ExternalLocaleMeta[]>(getExternalLocales);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentLang = i18n.language;
  const currentLabel =
    BUILT_IN_LANGUAGES.find((l) => l.lang === currentLang)?.label ??
    externalLocales.find((l) => l.lang === currentLang)?.label ??
    currentLang.toUpperCase();

  const switchLanguage = useCallback((lang: string) => {
    i18n.changeLanguage(lang);
  }, []);

  const handleImportUrl = useCallback(async () => {
    if (!url.trim()) return;
    setImporting(true);
    setStatus(null);
    try {
      const pack = await loadLocaleFromUrl(url.trim());
      setExternalLocales(getExternalLocales());
      setStatus({ type: 'success', message: t('language.importSuccess', { label: pack.label }) });
      setUrl('');
      setTimeout(() => {
        setUrlDialogOpen(false);
        setStatus(null);
      }, 1200);
    } catch (err) {
      setStatus({ type: 'error', message: t('language.importFailed', { message: (err as Error).message }) });
    } finally {
      setImporting(false);
    }
  }, [url, t]);

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await loadLocaleFromFile(file);
      setExternalLocales(getExternalLocales());
    } catch {
      // silently ignore invalid files
    }
    // reset so the same file can be re-selected
    e.target.value = '';
  }, []);

  const handleRemove = useCallback((lang: string) => {
    removeExternalLocale(lang);
    setExternalLocales(getExternalLocales());
  }, []);

  return (
    <Dialog open={urlDialogOpen} onOpenChange={setUrlDialogOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            aria-label={t('language.label')}
          >
            <Globe className="size-3.5" />
            <span>{currentLabel}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-56">
          <DropdownMenuLabel>{t('language.builtIn')}</DropdownMenuLabel>
          <DropdownMenuGroup>
            {BUILT_IN_LANGUAGES.map((l) => (
              <DropdownMenuItem key={l.lang} onSelect={() => switchLanguage(l.lang)}>
                {currentLang === l.lang && <Check className="size-3.5" />}
                <span className={currentLang === l.lang ? 'font-medium' : ''}>{l.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>

          {externalLocales.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t('language.community')}</DropdownMenuLabel>
              <DropdownMenuGroup>
                {externalLocales.map((l) => (
                  <DropdownMenuItem
                    key={l.lang}
                    className="flex items-center justify-between"
                    onSelect={() => switchLanguage(l.lang)}
                  >
                    <span className="flex items-center gap-2">
                      {currentLang === l.lang && <Check className="size-3.5" />}
                      <span className={currentLang === l.lang ? 'font-medium' : ''}>{l.label}</span>
                    </span>
                    <button
                      className="ml-auto rounded p-0.5 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(l.lang);
                      }}
                      aria-label={t('language.remove')}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setUrlDialogOpen(true)}>
            <Link className="size-3.5" />
            {t('language.importFromUrl')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
            <Upload className="size-3.5" />
            {t('language.importFromFile')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportFile}
      />

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('language.importTitle')}</DialogTitle>
          <DialogDescription>{t('language.importFromUrl')}</DialogDescription>
        </DialogHeader>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('language.urlPlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleImportUrl();
          }}
        />
        {status && (
          <p className={`text-sm ${status.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {status.message}
          </p>
        )}
        <DialogFooter>
          <Button onClick={handleImportUrl} disabled={importing || !url.trim()}>
            {importing ? t('language.importing') : t('language.import')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
