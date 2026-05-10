import { load } from '@tauri-apps/plugin-store';
import type { FileNode } from '@/types';

export type StoredSettingsSnapshot = {
    savedLastPath: string | null;
    savedLlmId: string | null;
    savedLogLevel: unknown;
    savedPackOptions: unknown;
    savedTheme: 'dark' | 'light' | null;
    legacyDebugLogging: boolean | null;
    store: Awaited<ReturnType<typeof load>>;
};

export async function readStoredSettings(): Promise<StoredSettingsSnapshot> {
    const store = await load('settings.json');
    return {
        legacyDebugLogging: (await store.get<boolean>('debugLogging')) ?? null,
        savedLastPath: (await store.get<string>('lastProjectPath')) ?? null,
        savedLlmId: (await store.get<string>('lastLlmProfileId')) ?? null,
        savedLogLevel: await store.get('logLevel'),
        savedPackOptions: await store.get('packOptions'),
        savedTheme: (await store.get<'dark' | 'light'>('theme')) ?? null,
        store,
    };
}

export async function loadProjectContents(
    nodes: FileNode[],
    readProjectFile: (path: string) => Promise<string>,
    onError: (path: string, error: unknown) => void,
): Promise<Map<string, string>> {
    const contentMap = new Map<string, string>();

    async function loadNode(node: FileNode): Promise<void> {
        if (node.isDir) {
            if (node.children) {
                await Promise.all(node.children.map(loadNode));
            }
            return;
        }

        try {
            const content = await readProjectFile(node.path);
            contentMap.set(node.path, content);
        } catch (error) {
            onError(node.path, error);
        }
    }

    await Promise.all(nodes.map(loadNode));
    return contentMap;
}

export function findNodeByPath<T extends { path: string; children?: T[] }>(nodes: T[], targetPath: string): T | null {
    for (const node of nodes) {
        if (node.path === targetPath) {
            return node;
        }
        if (node.children) {
            const found = findNodeByPath(node.children, targetPath);
            if (found) {
                return found;
            }
        }
    }
    return null;
}
