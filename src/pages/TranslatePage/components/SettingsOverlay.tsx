import SettingsPopover from "@/components/SettingsPopover";
import type { TranslateEngine, TranslationFallback } from "@/config";
import type { Language } from "@/types";

type SettingsOverlayProps = {
  sourceLang: Language;
  targetLang: Language;
  apiKey: string;
  engine: TranslateEngine;
  translationFallback: TranslationFallback;
  whisperModelId: string;
  whisperModelPath: string;
  translateModelId: string;
  translateModelPath: string;
  onUpdate: (patch: {
    sourceLang?: Language;
    targetLang?: Language;
    apiKey?: string;
    engine?: TranslateEngine;
    translationFallback?: TranslationFallback;
    whisperModelId?: string;
    whisperModelPath?: string;
    translateModelId?: string;
    translateModelPath?: string;
  }) => void;
  onClose: () => void;
};

export default function SettingsOverlay({
  sourceLang,
  targetLang,
  apiKey,
  engine,
  translationFallback,
  whisperModelId,
  whisperModelPath,
  translateModelId,
  translateModelPath,
  onUpdate,
  onClose,
}: SettingsOverlayProps) {
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div
        className="absolute top-20 right-8 w-80 rounded-2xl bg-app-elevated ring-1 ring-app-border shadow-2xl p-5 z-50"
        onClick={(e) => e.stopPropagation()}
      >
        <SettingsPopover
          sourceLang={sourceLang}
          targetLang={targetLang}
          onSourceLangChange={(l) => onUpdate({ sourceLang: l })}
          onTargetLangChange={(l) => onUpdate({ targetLang: l })}
          apiKey={apiKey}
          engine={engine}
          onEngineChange={(value) => onUpdate({ engine: value })}
          translationFallback={translationFallback}
          onTranslationFallbackChange={(value) => onUpdate({ translationFallback: value })}
          whisperModelId={whisperModelId}
          whisperModelPath={whisperModelPath}
          onWhisperModelChange={(id, path) =>
            onUpdate({ whisperModelId: id, whisperModelPath: path })
          }
          translateModelId={translateModelId}
          translateModelPath={translateModelPath}
          onTranslateModelChange={(id, path) =>
            onUpdate({ translateModelId: id, translateModelPath: path })
          }
          onApiKeyChange={(k) => onUpdate({ apiKey: k })}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
