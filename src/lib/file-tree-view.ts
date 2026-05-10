export function getFileTreeProjectKey(projectPath: string | null, loadRevision: number): string {
    return projectPath ? `file-tree:${projectPath}:${loadRevision}` : 'file-tree:no-project';
}
