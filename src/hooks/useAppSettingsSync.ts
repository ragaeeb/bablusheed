import type { load } from '@tauri-apps/plugin-store';
import { useEffect } from 'react';
import { readStoredSettings } from '@/lib/app-helpers';
import { normalizeSavedPackOptions } from '@/lib/pack-options';
import type { PackOptions as PackOptionsType } from '@/types';

type LogLevel = 'off' | 'error' | 'info' | 'debug';

type UseAppSettingsSyncOptions = {
    defaults: PackOptionsType;
    hasTauriRuntime: boolean;
    lastProjectNameSetter: (name: string | null) => void;
    lastProjectPathSetter: (path: string | null) => void;
    llmId: string;
    logLevel: LogLevel;
    logLevelGuard: (value: unknown) => value is LogLevel;
    logLevelSetter: (level: LogLevel) => void;
    packOptions: PackOptionsType;
    packOptionsSetter: (options: PackOptionsType) => void;
    selectedLlmIdSetter: (id: string) => void;
    storeRef: React.MutableRefObject<Awaited<ReturnType<typeof load>> | null>;
    theme: 'dark' | 'light';
    themeSetter: (theme: 'dark' | 'light') => void;
};

type StoredSettingsAppliers = Pick<
    UseAppSettingsSyncOptions,
    | 'defaults'
    | 'lastProjectNameSetter'
    | 'lastProjectPathSetter'
    | 'logLevelGuard'
    | 'logLevelSetter'
    | 'packOptionsSetter'
    | 'selectedLlmIdSetter'
    | 'themeSetter'
>;

function deriveProjectName(projectPath: string): string {
    const parts = projectPath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] ?? projectPath;
}

function applyStoredSettings(
    snapshot: Awaited<ReturnType<typeof readStoredSettings>>,
    appliers: StoredSettingsAppliers,
) {
    if (snapshot.savedTheme) {
        appliers.themeSetter(snapshot.savedTheme);
    }
    if (snapshot.savedLlmId) {
        appliers.selectedLlmIdSetter(snapshot.savedLlmId);
    }
    if (appliers.logLevelGuard(snapshot.savedLogLevel)) {
        appliers.logLevelSetter(snapshot.savedLogLevel);
    } else if (snapshot.legacyDebugLogging) {
        appliers.logLevelSetter('debug');
    }
    if (snapshot.savedPackOptions) {
        appliers.packOptionsSetter(
            normalizeSavedPackOptions(snapshot.savedPackOptions as PackOptionsType, appliers.defaults),
        );
    }
    if (snapshot.savedLastPath) {
        appliers.lastProjectPathSetter(snapshot.savedLastPath);
        appliers.lastProjectNameSetter(deriveProjectName(snapshot.savedLastPath));
    }
}

export function useAppSettingsSync({
    defaults,
    hasTauriRuntime,
    lastProjectNameSetter,
    lastProjectPathSetter,
    llmId,
    logLevel,
    logLevelGuard,
    logLevelSetter,
    packOptions,
    packOptionsSetter,
    selectedLlmIdSetter,
    storeRef,
    theme,
    themeSetter,
}: UseAppSettingsSyncOptions) {
    useEffect(() => {
        if (!hasTauriRuntime) {
            return;
        }

        async function syncFromStore() {
            try {
                const snapshot = await readStoredSettings();
                storeRef.current = snapshot.store;
                applyStoredSettings(snapshot, {
                    defaults,
                    lastProjectNameSetter,
                    lastProjectPathSetter,
                    logLevelGuard,
                    logLevelSetter,
                    packOptionsSetter,
                    selectedLlmIdSetter,
                    themeSetter,
                });
            } catch (error) {
                console.warn('Failed to load settings:', error);
            }
        }

        void syncFromStore();
    }, [
        defaults,
        hasTauriRuntime,
        lastProjectNameSetter,
        lastProjectPathSetter,
        logLevelGuard,
        logLevelSetter,
        packOptionsSetter,
        selectedLlmIdSetter,
        storeRef,
        themeSetter,
    ]);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!storeRef.current) {
                return;
            }
            try {
                await storeRef.current.set('theme', theme);
                await storeRef.current.set('lastLlmProfileId', llmId);
                await storeRef.current.set('packOptions', packOptions);
                await storeRef.current.set('logLevel', logLevel);
                await storeRef.current.save();
            } catch (error) {
                console.warn('Failed to save settings:', error);
            }
        }, 1500);

        return () => clearTimeout(timer);
    }, [llmId, logLevel, packOptions, storeRef, theme]);
}
