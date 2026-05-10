/**
 * Builds the remount key for the file-tree view.
 *
 * @param projectPath - The currently opened project path, or `null` when no project is loaded.
 * @param loadRevision - A monotonically increasing revision used to force remounts on reload.
 * @returns A stable key string in the form `file-tree:{projectPath}:{loadRevision}` or
 * `file-tree:no-project` when no project is active.
 */
export function getFileTreeProjectKey(projectPath: string | null, loadRevision: number): string {
    return projectPath ? `file-tree:${projectPath}:${loadRevision}` : 'file-tree:no-project';
}
