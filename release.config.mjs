export default {
    branches: ['main'],
    plugins: [
        [
            '@semantic-release/commit-analyzer',
            {
                preset: 'conventionalcommits',
                releaseRules: [
                    { release: 'patch', scope: 'readme', type: 'docs' },
                    { release: 'patch', scope: 'deps', type: 'chore' },
                    { release: 'patch', scope: 'release', type: 'chore' },
                ],
            },
        ],
        '@semantic-release/release-notes-generator',
        [
            '@semantic-release/changelog',
            {
                changelogFile: 'CHANGELOG.md',
            },
        ],
        [
            '@semantic-release/exec',
            {
                prepareCmd: 'node scripts/sync-version.mjs ${nextRelease.version}',
            },
        ],
        [
            '@semantic-release/git',
            {
                assets: ['CHANGELOG.md', 'package.json', 'src-tauri/Cargo.toml', 'src-tauri/tauri.conf.json'],
                message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
            },
        ],
        '@semantic-release/github',
    ],
    tagFormat: 'v${version}',
};
