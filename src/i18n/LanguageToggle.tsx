import { Languages } from 'lucide-react'
import { Button } from '../components/ui'
import { appMessages } from './appMessages'
import { useI18n, useMessages } from './index'

export function LanguageToggle({ className = '' }: { className?: string }) {
  const { language, setLanguage } = useI18n()
  const m = useMessages(appMessages).shell.language
  return (
    <Button
      className={className}
      variant="quiet"
      size="sm"
      icon={<Languages size={15} />}
      aria-label={m.switchTo}
      title={m.current}
      onClick={() => setLanguage(language === 'en' ? 'de' : 'en')}
    >
      {m.short}
    </Button>
  )
}
